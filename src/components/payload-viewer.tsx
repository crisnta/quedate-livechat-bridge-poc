import { redact } from "@/lib/livechat/validation";
export function PayloadViewer({ payload }: { payload: unknown }) {
  return (
    <section>
      <h2>Payload recibido · copia redactada</h2>
      <p>
        secret_key reemplazado antes de persistir. El JSON se muestra como
        texto.
      </p>
      <pre>{JSON.stringify(redact(payload), null, 2)}</pre>
    </section>
  );
}
