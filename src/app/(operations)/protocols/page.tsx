import { Heading, Badge, Empty } from "@/components/operations/shared";
export default function Future() {
  return (
    <>
      <Heading
        title="Protocolos"
        description="Arquitectura visual preparada. No hay protocolo clínico, etapas ni decisiones implementadas."
      >
        <Badge>Próximamente</Badge>
      </Heading>
      <section className="panel">
        <Empty
          title="No habilitado"
          description="No disponible con la instrumentación actual."
        />
      </section>
    </>
  );
}
