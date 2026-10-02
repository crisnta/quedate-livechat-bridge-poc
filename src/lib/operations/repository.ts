import type { Query } from "../events/repository";
import type {
  Conversation,
  ConversationDetail,
  Filters,
  Health,
  Overview,
  Page,
  TechnicalEvent,
  TimelineItem,
} from "./types";
import { maskIdentifier, redactForDisplay } from "./privacy";
const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v);
const nullable = (v: unknown): string | null => (v == null ? null : iso(v));
const num = (v: unknown) => Number(v ?? 0);
const PAGE_SIZE = 25;
const EVENT_COLUMNS =
  "id,action,chat_id,thread_id,event_id,event_type,author_type,text,created_at,received_at,webhook_id,delivery_count,normalization_status,normalization_errors,normalization_version";
function scoped(f: Filters, org: string) {
  return {
    params: [org, f.from, f.to, f.chat, f.group, f.agent],
    sql: `WITH scoped AS (
 SELECT e.id,e.chat_id,e.thread_id,e.action,e.event_type,e.author_type,e.author_id,e.text,e.created_at,e.received_at,e.delivery_count,e.normalization_status
 FROM bridge.webhook_events e WHERE e.organization_id=$1
 AND e.received_at>=($2::date::timestamp AT TIME ZONE 'America/Santiago')
 AND e.received_at<((($3::date+1)::timestamp) AT TIME ZONE 'America/Santiago')
 AND ($4='' OR strpos(e.chat_id,$4)>0)
 AND ($5='' OR EXISTS(SELECT 1 FROM bridge.chat_context c WHERE c.organization_id=e.organization_id AND c.chat_id=e.chat_id AND c.thread_id=e.thread_id AND c.group_ids @> jsonb_build_array(NULLIF($5,'')::bigint)))
 AND ($6='' OR EXISTS(SELECT 1 FROM bridge.webhook_events a WHERE a.organization_id=e.organization_id AND a.chat_id=e.chat_id AND a.thread_id=e.thread_id AND a.author_type='agent' AND a.author_id=$6))
 )`,
  };
}
export function createOperationsReader(query: Query, organization: string) {
  return {
    async health(): Promise<Health> {
      const { rows } = await query(
        `SELECT count(*)::text || ':' || coalesce(sum(delivery_count),0)::text || ':' || coalesce((SELECT max(updated_at)::text FROM bridge.chat_context WHERE organization_id=$1),'') AS revision, max(last_received_at) AS last_webhook,max(created_at) AS last_source_activity,max(received_at) FILTER(WHERE action='incoming_chat') AS last_chat,max(received_at) FILTER(WHERE action='incoming_event') AS last_event,min(received_at) AS coverage_start FROM bridge.webhook_events WHERE organization_id=$1`,
        [organization],
      );
      const r = rows[0];
      return {
        revision: String(r.revision),
        last_webhook: nullable(r.last_webhook),
        last_source_activity: nullable(r.last_source_activity),
        last_chat: nullable(r.last_chat),
        last_event: nullable(r.last_event),
        coverage_start: nullable(r.coverage_start),
        checked_at: new Date().toISOString(),
      };
    },
    async overview(f: Filters): Promise<Overview> {
      const s = scoped(f, organization);
      const { rows } = await query(
        `${s.sql},chat_totals AS(SELECT chat_id,count(*) FILTER(WHERE event_type='message' AND author_type='agent') AS agent_messages FROM scoped WHERE chat_id IS NOT NULL GROUP BY chat_id),groups AS(SELECT DISTINCT s.chat_id,jsonb_array_elements_text(c.group_ids)::bigint AS group_id FROM scoped s JOIN bridge.chat_context c ON c.organization_id=$1 AND c.chat_id=s.chat_id AND c.thread_id=s.thread_id),daily AS(SELECT to_char(received_at AT TIME ZONE 'America/Santiago','YYYY-MM-DD') AS bucket,count(DISTINCT chat_id)::int AS chats,count(*) FILTER(WHERE action='incoming_event' AND event_type='message')::int AS messages FROM scoped GROUP BY 1 ORDER BY 1),hourly AS(SELECT to_char(received_at AT TIME ZONE 'America/Santiago','HH24') AS bucket,count(DISTINCT chat_id)::int AS chats,count(*) FILTER(WHERE action='incoming_event' AND event_type='message')::int AS messages FROM scoped GROUP BY 1 ORDER BY 1)
 SELECT count(DISTINCT chat_id)::int AS conversations,count(*) FILTER(WHERE action='incoming_chat')::int AS threads,count(*) FILTER(WHERE action='incoming_event' AND event_type='message')::int AS messages,
 count(*) FILTER(WHERE event_type='message' AND author_type='customer')::int AS customer_messages,count(*) FILTER(WHERE event_type='message' AND author_type='agent')::int AS agent_messages,count(*) FILTER(WHERE event_type='message' AND author_type='unknown')::int AS unknown_messages,
 count(*) FILTER(WHERE normalization_status='unsupported_shape')::int AS unsupported,count(*) FILTER(WHERE normalization_status='pending_context')::int AS pending,coalesce(sum(delivery_count-1),0)::int AS repeated_deliveries,
 (SELECT count(*)::int FROM chat_totals WHERE agent_messages>0) AS with_agent,(SELECT count(*)::int FROM chat_totals WHERE agent_messages=0) AS without_agent,
 coalesce((SELECT jsonb_agg(d) FROM daily d),'[]') AS daily,coalesce((SELECT jsonb_agg(h) FROM hourly h),'[]') AS hourly,
 coalesce((SELECT jsonb_agg(g) FROM(SELECT group_id,count(DISTINCT chat_id)::int AS chats FROM groups GROUP BY group_id ORDER BY chats DESC LIMIT 20)g),'[]') AS groups FROM scoped`,
        s.params,
      );
      const r = rows[0];
      return {
        ...Object.fromEntries(
          [
            "conversations",
            "threads",
            "messages",
            "customer_messages",
            "agent_messages",
            "unknown_messages",
            "unsupported",
            "pending",
            "repeated_deliveries",
            "with_agent",
            "without_agent",
          ].map((k) => [k, num(r[k])]),
        ),
        daily: r.daily,
        hourly: r.hourly,
        groups: r.groups,
      } as Overview;
    },
    async conversations(
      f: Filters,
      preview = false,
    ): Promise<Page<Conversation>> {
      const s = scoped(f, organization);
      const order =
        f.sort === "oldest"
          ? "first_seen ASC,chat_id ASC"
          : f.sort === "messages"
            ? "messages DESC,chat_id ASC"
            : "last_seen DESC,chat_id ASC";
      const { rows } = await query(
        `${s.sql},conversations AS(SELECT chat_id,min(received_at) AS first_seen,max(received_at) AS last_seen,count(*) FILTER(WHERE event_type='message')::int AS messages,count(*) FILTER(WHERE event_type='message' AND author_type='agent')::int AS agent_messages,count(DISTINCT thread_id)::int AS threads FROM scoped WHERE chat_id IS NOT NULL GROUP BY chat_id)
 SELECT c.*,
 coalesce((SELECT jsonb_agg(DISTINCT g.value::bigint) FROM bridge.chat_context x CROSS JOIN LATERAL jsonb_array_elements_text(x.group_ids)g(value) WHERE x.organization_id=$1 AND x.chat_id=c.chat_id AND x.thread_id IN(SELECT thread_id FROM scoped WHERE chat_id=c.chat_id)),'[]') AS group_ids,
 coalesce((SELECT jsonb_agg(DISTINCT author_id) FROM scoped WHERE chat_id=c.chat_id AND author_type='agent' AND author_id IS NOT NULL),'[]') AS agents
 ${preview ? `,(SELECT left(text,140) FROM scoped WHERE chat_id=c.chat_id AND event_type='message' ORDER BY coalesce(created_at,received_at) DESC,id DESC LIMIT 1) AS last_text,(SELECT author_type FROM scoped WHERE chat_id=c.chat_id AND event_type='message' ORDER BY coalesce(created_at,received_at) DESC,id DESC LIMIT 1) AS last_author` : ""}
 FROM conversations c WHERE ($7='' OR ($7='with' AND agent_messages>0) OR ($7='without' AND agent_messages=0)) ORDER BY ${order} LIMIT 26 OFFSET $8`,
        [...s.params, f.response, (f.page - 1) * PAGE_SIZE],
      );
      return {
        items: rows.slice(0, PAGE_SIZE).map(
          (r) =>
            ({
              ...r,
              first_seen: iso(r.first_seen),
              last_seen: iso(r.last_seen),
              agents: (r.agents as string[]).map(maskIdentifier),
            }) as Conversation,
        ),
        hasMore: rows.length > PAGE_SIZE,
        page: f.page,
      };
    },
    async events(f: Filters): Promise<Page<TechnicalEvent>> {
      const s = scoped(f, organization);
      const { rows } = await query(
        `${s.sql} SELECT ${EVENT_COLUMNS} FROM bridge.webhook_events WHERE organization_id=$1 AND id IN(SELECT id FROM scoped) ORDER BY received_at DESC,id DESC LIMIT 51 OFFSET $7`,
        [...s.params, (f.page - 1) * 50],
      );
      return {
        items: rows.slice(0, 50).map(
          (r) =>
            ({
              ...r,
              created_at: nullable(r.created_at),
              received_at: iso(r.received_at),
            }) as TechnicalEvent,
        ),
        hasMore: rows.length > 50,
        page: f.page,
      };
    },
    async event(id: string) {
      const { rows } = await query(
        `SELECT ${EVENT_COLUMNS},raw_payload FROM bridge.webhook_events WHERE organization_id=$1 AND id=$2::uuid`,
        [organization, id],
      );
      if (!rows[0]) return null;
      return {
        ...rows[0],
        raw_payload: redactForDisplay(rows[0].raw_payload),
        created_at: nullable(rows[0].created_at),
        received_at: iso(rows[0].received_at),
      } as TechnicalEvent & { raw_payload: unknown };
    },
    async detail(
      chat: string,
      page = 1,
      thread?: string,
    ): Promise<ConversationDetail | null> {
      const contexts = await query(
        `SELECT thread_id,group_ids,users FROM bridge.chat_context WHERE organization_id=$1 AND chat_id=$2 ORDER BY updated_at DESC`,
        [organization, chat],
      );
      const stats = await query(
        `SELECT min(received_at) AS first_seen,max(received_at) AS last_seen,count(*) AS total FROM bridge.webhook_events WHERE organization_id=$1 AND chat_id=$2`,
        [organization, chat],
      );
      if (!num(stats.rows[0].total)) return null;
      const result = await query(
        `WITH timeline AS (
    SELECT id::text AS key,thread_id,event_id,CASE WHEN action='incoming_chat' THEN 'incoming_chat' ELSE coalesce(event_type,'unknown') END AS type,author_type,text,created_at::text,received_at,'webhook' AS source,normalization_status FROM bridge.webhook_events WHERE organization_id=$1 AND chat_id=$2 AND ($3='' OR thread_id=$3)
    UNION ALL
    SELECT 'snapshot:'||c.thread_id||':'||(x.value->>'id') AS key,c.thread_id,x.value->>'id' AS event_id,coalesce(x.value->>'type','unknown') AS type,
      CASE WHEN x.value->>'type'='system_message' THEN 'system' ELSE coalesce(ctx.users->>(x.value->>'author_id'),'unknown') END AS author_type,
      x.value->>'text' AS text,x.value->>'created_at' AS created_at,c.received_at,'initial_snapshot' AS source,'snapshot' AS normalization_status
    FROM bridge.webhook_events c
    LEFT JOIN bridge.chat_context ctx ON ctx.organization_id=c.organization_id AND ctx.chat_id=c.chat_id AND ctx.thread_id=c.thread_id
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.raw_payload #> '{payload,chat,thread,events}')='array' THEN c.raw_payload #> '{payload,chat,thread,events}' ELSE '[]'::jsonb END)x(value)
    WHERE c.organization_id=$1 AND c.chat_id=$2 AND c.action='incoming_chat' AND ($3='' OR c.thread_id=$3) AND x.value->>'id' IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM bridge.webhook_events known WHERE known.organization_id=$1 AND known.chat_id=$2 AND known.thread_id=c.thread_id AND known.event_id=x.value->>'id')
   ) SELECT DISTINCT ON(received_at,key) key,thread_id,event_id,type,author_type,text,created_at,received_at,source,normalization_status FROM timeline ORDER BY received_at DESC,key DESC LIMIT 101 OFFSET $4`,
        [organization, chat, thread ?? "", (page - 1) * 100],
      );
      const unique = result.rows
        .slice(0, 100)
        .map((r) => ({
          key: String(r.key),
          thread_id: r.thread_id as string | null,
          event_id: r.event_id as string | null,
          type: String(r.type),
          author_type: String(r.author_type),
          text: r.text as string | null,
          created_at:
            r.created_at && Number.isFinite(Date.parse(String(r.created_at)))
              ? new Date(String(r.created_at)).toISOString()
              : null,
          received_at: iso(r.received_at),
          source: r.source as TimelineItem["source"],
          normalization_status: String(r.normalization_status),
        }))
        .sort(
          (a, b) =>
            (a.created_at ?? a.received_at).localeCompare(
              b.created_at ?? b.received_at,
            ) || a.key.localeCompare(b.key),
        );
      return {
        chat_id: chat,
        threads: contexts.rows.map((c) => ({
          ...c,
          users: Object.fromEntries(
            Object.entries(c.users as Record<string, string>).map(
              ([id, type]) => [maskIdentifier(id), type],
            ),
          ),
        })) as ConversationDetail["threads"],
        timeline: unique,
        hasMore: result.rows.length > 100,
        page,
        first_seen: iso(stats.rows[0].first_seen),
        last_seen: iso(stats.rows[0].last_seen),
        visitorAvailable: true,
        observed: true,
      };
    },
    async visitor(chat: string) {
      const { rows } = await query(
        `SELECT raw_payload #> '{payload,chat,users}' AS users FROM bridge.webhook_events WHERE organization_id=$1 AND chat_id=$2 AND action='incoming_chat' ORDER BY received_at DESC LIMIT 1`,
        [organization, chat],
      );
      const users = Array.isArray(rows[0]?.users) ? rows[0].users : [];
      return users
        .filter((u) => u.type === "customer")
        .map((u) => ({
          alias: typeof u.name === "string" ? u.name : null,
          email: typeof u.email === "string" ? u.email : null,
        }));
    },
    async agents(f: Filters) {
      const s = scoped(f, organization);
      const { rows } = await query(
        `${s.sql} SELECT author_id,count(DISTINCT chat_id)::int AS conversations,count(*) FILTER(WHERE event_type='message')::int AS messages,max(received_at) AS last_seen FROM scoped WHERE author_type='agent' AND author_id IS NOT NULL GROUP BY author_id ORDER BY last_seen DESC,author_id LIMIT 26 OFFSET $7`,
        [...s.params, (f.page - 1) * 25],
      );
      return {
        items: rows.slice(0, 25).map((r) => ({
          ...r,
          author_id: maskIdentifier(String(r.author_id)),
          conversations: num(r.conversations),
          messages: num(r.messages),
          last_seen: iso(r.last_seen),
        })),
        hasMore: rows.length > 25,
        page: f.page,
      };
    },
    async groups(f: Filters) {
      const s = scoped(f, organization);
      const { rows } = await query(
        `${s.sql} SELECT g.value::bigint AS group_id,count(DISTINCT s.chat_id)::int AS conversations,max(s.received_at) AS last_seen FROM scoped s JOIN bridge.chat_context c ON c.organization_id=$1 AND c.chat_id=s.chat_id AND c.thread_id=s.thread_id CROSS JOIN LATERAL jsonb_array_elements_text(c.group_ids)g(value) GROUP BY g.value ORDER BY last_seen DESC,g.value LIMIT 26 OFFSET $7`,
        [...s.params, (f.page - 1) * 25],
      );
      return {
        items: rows.slice(0, 25).map((r) => ({
          group_id: num(r.group_id),
          conversations: num(r.conversations),
          last_seen: iso(r.last_seen),
        })),
        hasMore: rows.length > 25,
        page: f.page,
      };
    },
  };
}
