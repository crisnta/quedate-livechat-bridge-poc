import { Heading, Badge, Empty } from "@/components/operations/shared";
export default function Future() {
  return (
    <>
      <Heading
        title="Inteligencia artificial"
        description="Resumen, categoría, pertinencia, señales y revisión humana: futuras capacidades, sin procesamiento habilitado."
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
