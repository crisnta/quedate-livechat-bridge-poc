import { Heading, Badge, Empty } from "@/components/operations/shared";
export default function Future() {
  return (
    <>
      <Heading
        title="Categorías"
        description="La categorización automática será incorporada en una etapa posterior."
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
