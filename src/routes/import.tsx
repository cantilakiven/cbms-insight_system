import { createFileRoute } from "@tanstack/react-router";
import { ImportPanel } from "@/components/DataGate";

export const Route = createFileRoute("/import")({
  component: ImportPage,
  head: () => ({
    meta: [
      { title: "Import CBMS Data · Local Data Municipal Analytics" },
      {
        name: "description",
        content:
          "Import your CBMS JSON datasets from this computer. Files are read one at a time to keep memory usage low.",
      },
      { property: "og:title", content: "Import CBMS Data · Local Data" },
      {
        property: "og:description",
        content: "Load Barangay, Household, Person and TVET CBMS JSON files into the offline analytics platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ImportPage() {
  return (
    <div className="space-y-6">
      <ImportPanel />
    </div>
  );
}
