import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { datasets, getActiveYear, getPersonFullName, householdKey, personsByHousehold } from "@/data/cbms";
import { fullName, labelOf, formatVal } from "@/lib/cbms-labels";

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{formatVal(value)}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 border-b border-border pb-2 font-display text-sm font-semibold uppercase tracking-wider text-primary">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}


function sourceLabel(key: string) {
  return key
    .replace(/^legacy_/i, "")
    .replace(/_/g, " ")
    .replace(/\\b\\w/g, (c) => c.toUpperCase());
}

function SourceValue({ value }: { value: any }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value !== "object") {
    return <span className="break-words">{formatVal(value)}</span>;
  }
  return <span className="font-mono text-xs break-all">{JSON.stringify(value)}</span>;
}

function SourceObject({ value, depth = 0 }: { value: any; depth?: number }) {
  if (value === null || value === undefined || typeof value !== "object") {
    return <SourceValue value={value} />;
  }

  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.length === 0 ? (
          <div className="text-xs text-muted-foreground">Empty</div>
        ) : (
          value.map((item, index) => (
            <details key={index} open={depth < 1} className="rounded-md border border-border/60 bg-muted/20">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
                Record {index + 1}
              </summary>
              <div className="space-y-2 border-t border-border/60 p-3">
                <SourceObject value={item} depth={depth + 1} />
              </div>
            </details>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(value).map(([key, item]) => (
        <div key={key} className="rounded-md border border-border/50 bg-background p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {sourceLabel(key)}
          </div>
          <SourceObject value={item} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}

function LegacySourceData({ data, year }: { data: any; year: number }) {
  if (!data || typeof data !== "object") return null;
  const entries = Object.entries(data);
  return (
    <div className="rounded-lg border border-border/70 bg-muted/10">
      <details>
        <summary className="cursor-pointer px-4 py-3 font-display text-sm font-semibold">
          Complete CBMS {year} source data
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            ({entries.length} top-level sections/fields)
          </span>
        </summary>
        <div className="space-y-2 border-t border-border/70 p-3">
          <p className="mb-3 text-xs text-muted-foreground">
            This view preserves the original export fields, including fields that
            do not have a direct 2024 normalized equivalent.
          </p>
          {entries.map(([key, value]) => (
            <details key={key} className="rounded-md border border-border/60 bg-background">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
                {sourceLabel(key)}
              </summary>
              <div className="border-t border-border/60 p-3">
                <SourceObject value={value} />
              </div>
            </details>
          ))}
        </div>
      </details>
    </div>
  );
}

export function PersonModal({ person, onClose }: { person: any | null; onClose: () => void }) {
  if (!person) return null;
  const year = getActiveYear();
  const isHead = person.a02_relation_to_hh_head === "Head" || person.line_number === 1;
  const householdMembers = isHead
    ? ((personsByHousehold(year).get(householdKey(person)) || []).slice().sort((a, b) => {
        const ah = a.a02_relation_to_hh_head === "Head" || a.line_number === 1 ? 0 : 1;
        const bh = b.a02_relation_to_hh_head === "Head" || b.line_number === 1 ? 0 : 1;
        if (ah !== bh) return ah - bh;
        const lineA = Number.isFinite(Number(a.line_number)) ? Number(a.line_number) : Number.MAX_SAFE_INTEGER;
        const lineB = Number.isFinite(Number(b.line_number)) ? Number(b.line_number) : Number.MAX_SAFE_INTEGER;
        if (lineA !== lineB) return lineA - lineB;
        return getPersonFullName(a).localeCompare(getPersonFullName(b), undefined, { sensitivity: "base" });
      }))
    : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader className="space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="font-display text-xl sm:text-2xl">{fullName(person)}</DialogTitle>
              {isHead && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                  Household Head
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              CBMS {year} · {person.area_name || "—"} · Household {person.husn ?? "—"}/{person.hsn ?? "—"} · Line {person.line_number ?? "—"}
            </p>
          </div>
        </DialogHeader>
        <div className="space-y-6 py-2">
          {isHead && (
            <section className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">Household Members</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Members recorded under this household head in CBMS {year}.
                  </p>
                </div>
                <div className="rounded-lg bg-background px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-border/60">
                  {householdMembers.length} {householdMembers.length === 1 ? "member" : "members"}
                </div>
              </div>

              {householdMembers.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                  No matching household member records are currently loaded.
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-xl border border-border/70 bg-background">
                  <div className="divide-y divide-border/60">
                    {householdMembers.map((member: any, index: number) => {
                      const memberIsHead = member.a02_relation_to_hh_head === "Head" || member.line_number === 1;
                      return (
                        <div key={`${member.area_code}-${member.husn}-${member.hsn}-${member.line_number}-${index}`} className={`grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_80px] sm:items-center ${memberIsHead ? "bg-primary/[0.05]" : ""}`}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className={`truncate text-sm font-semibold ${memberIsHead ? "text-primary" : "text-foreground"}`}>{getPersonFullName(member) || "(No name)"}</div>
                              {memberIsHead && <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">Head</span>}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {member.a03_sex || "—"} · Age {member.a05_age ?? "—"} · {member.a07_marital_status || "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Relationship</div>
                            <div className="mt-0.5 text-sm font-medium text-foreground">{memberIsHead ? "Head" : member.a02_relation_to_hh_head || "—"}</div>
                          </div>
                          <div className="sm:text-right">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Line</div>
                            <div className="mt-0.5 text-sm font-medium text-foreground">{member.line_number ?? "—"}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
          <Section title="Personal">
            <Field label="Age" value={person.a05_age} />
            <Field label="Sex" value={person.a03_sex} />
            <Field label="Birthday" value={person.a04_birthday_year ? `${person.a04_birthday_month}/${person.a04_birthday_day}/${person.a04_birthday_year}` : null} />
            <Field label="Civil Status" value={person.a07_marital_status} />
            <Field label="Religion" value={person.a08_religion} />
            <Field label="Ethnicity" value={person.a09_ethnicity} />
            <Field label="Citizenship" value={person.c01_citizenship} />
            <Field label="Relationship to Head" value={person.a02_relation_to_hh_head} />
            <Field label="Literate" value={person.a10_simple_literacy} />
          </Section>
          <Section title="Education">
            <Field label="Educational Level" value={person.a11_hgc_level} />
            <Field label="Highest Grade" value={person.a11_hgc} />
            <Field label="Currently in School" value={person.d01_currently_attending_school} />
            <Field label="TVET Graduate" value={person.d07_tvet_graduate} />
            <Field label="Attending TVET" value={person.d08_tvet_currently_attending} />
          </Section>
          <Section title="Employment">
            <Field label="Labor Force" value={person.e01_labor_force_participation} />
            <Field label="Employment Status" value={person.e01_employment_status} />
            <Field label="Underemployment" value={person.e01_underemployment_status} />
            <Field label="Occupation" value={person.e05_psoc} />
            <Field label="Occupation Group" value={person.e05_occupation_group} />
            <Field label="Industry" value={person.e06_industry_group} />
            <Field label="Nature of Employment" value={person.e07_nature_of_employment} />
            <Field label="Class of Worker" value={person.e08_class_of_worker} />
            <Field label="Basis of Payment" value={person.e09_basis_of_payment} />
            <Field label="Basic Pay / Day (CBMS 2022 E20)" value={person.e20_basic_pay_per_day != null ? `₱${Number(person.e20_basic_pay_per_day).toLocaleString()}` : null} />
            <Field label="Hours Worked" value={person.e11_number_of_hours_worked_in_all_jobs} />
            <Field label="Farmer" value={person.e17_farmer} />
            <Field label="Fisherfolk" value={person.e18_fisherfolk} />
          </Section>
          <Section title="Sectoral & Disability">
            <Field label="PhilSys ID" value={person.b03_phil_id} />
            <Field label="Solo Parent" value={person.b05_solo_parent} />
            <Field label="Senior Citizen ID" value={person.b07_senior_citizen_id} />
            <Field label="PWD" value={person.b10_pwd} />
            <Field label="With PWD ID" value={person.b11_with_pwd_id} />
            <Field label="Pregnant" value={person.b08_currently_pregnant} />
            <Field label="Lactating" value={person.b09_lactating_mother} />
            <Field label="Seeing" value={person.b13_seeing} />
            <Field label="Hearing" value={person.b14_hearing} />
            <Field label="Walking" value={person.b15_walking} />
          </Section>
          <Section title="Social Protection">
            <Field label="SSS" value={person.m01_a_sss} />
            <Field label="GSIS" value={person.m01_b_gsis} />
            <Field label="PhilHealth" value={person.m01_c_philhealth} />
            <Field label="4Ps" value={person.m05_a_4ps} />
            <Field label="Social Pension" value={person.m05_b_socpen} />
          </Section>
          <LegacySourceData data={person.legacy_raw} year={year} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HouseholdModal({ household, onClose }: { household: any | null; onClose: () => void }) {
  if (!household) return null;
  const key = `${household.area_code}-${household.husn}-${household.hsn}`;
  const members: any[] = personsByHousehold().get(key) || [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Household {household.husn}/{household.hsn} · {household.area_name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {household.hh_size} members · {household.overcrowding_status}
          </p>
        </DialogHeader>
        <div className="space-y-6 py-2">
          <Section title="Composition">
            <Field label="Household Size" value={household.hh_size} />
            <Field label="Males" value={household.number_of_males} />
            <Field label="Females" value={household.number_of_females} />
            <Field label="Nuclear Families" value={household.number_of_nuclear_families} />
            <Field label="Overcrowding" value={household.overcrowding_status} />
            <Field label="Sitio/Purok" value={household.address_sitio_purok} />
          </Section>
          <Section title="Water & Sanitation">
            <Field label="Main Water" value={household.n01_main_water} />
            <Field label="Drinking Water" value={household.n02_drinking_water} />
            <Field label="Drinking Water Service" value={household.n03_service_level_drinking_water} />
            <Field label="Toilet Facility" value={household.n08_toilet_facility} />
            <Field label="Toilet Service Level" value={household.n08_service_level_toilet_facility} />
            <Field label="Handwashing Facility" value={household.n13_service_level_handwashing_facility} />
          </Section>
          <Section title="Housing">
            <Field label="Building Type" value={household.o01_building_type} />
            <Field label="Floors" value={household.o02_number_of_floors} />
            <Field label="Roof" value={household.o03_roof} />
            <Field label="Outer Walls" value={household.o04_outer_walls} />
            <Field label="Floor" value={household.o06_floor} />
            <Field label="Floor Area" value={household.o07_floor_area_range} />
            <Field label="Bedrooms" value={household.o08_number_of_bedrooms} />
            <Field label="Tenure" value={household.o09_tenure} />
            <Field label="Year Built" value={household.o10_year_constructed} />
          </Section>
          <Section title="Utilities & Connectivity">
            <Field label="Electricity" value={household.o11_electricity} />
            <Field label="Lighting Fuel" value={household.o12_fuel_for_lighting} />
            <Field label="Cooking Fuel" value={household.o13_fuel_for_cooking} />
            <Field label="Internet Access" value={household.k01_internet_access} />
            <Field label="Internet at Home" value={household.k02_internet_at_home} />
            <Field label="Safe Walking at Night" value={household.l01_safe_walking_alone} />
          </Section>
          <LegacySourceData data={household.legacy_raw} year={2022} />

          <div>
            <h3 className="mb-3 border-b border-border pb-2 font-display text-sm font-semibold uppercase tracking-wider text-primary">
              Household Members ({members.length})
            </h3>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching person records loaded.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Name</th>
                      <th className="px-2 py-1.5 text-left font-medium">Age</th>
                      <th className="px-2 py-1.5 text-left font-medium">Sex</th>
                      <th className="px-2 py-1.5 text-left font-medium">Civil Status</th>
                      <th className="px-2 py-1.5 text-left font-medium">Education</th>
                      <th className="px-2 py-1.5 text-left font-medium">Employment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m: any, i: number) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5 font-medium">{fullName(m)}</td>
                        <td className="px-2 py-1.5">{m.a05_age ?? "—"}</td>
                        <td className="px-2 py-1.5">{m.a03_sex ?? "—"}</td>
                        <td className="px-2 py-1.5">{m.a07_marital_status ?? "—"}</td>
                        <td className="px-2 py-1.5">{m.a11_hgc_level ?? "—"}</td>
                        <td className="px-2 py-1.5">{m.e01_employment_status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
