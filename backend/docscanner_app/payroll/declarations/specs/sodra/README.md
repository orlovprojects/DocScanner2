# Sodra SD pranešimų specifikacijos (FFData)

Sugeneruota automatiškai iš oficialių Sodra .mxfd šablonų (sodra.lt → Formos ir šablonai → Draudėjams).

| Forma | Versija | Lapai (eilučių lape) |
|---|---|---|
| SAM | 07 | SAM (antraštė), SAM3SD (6), SAM3SDP (3) |
| 1-SD | 11 | 1-SD (1), 1-SD-T (2) |
| 2-SD | 09 | 2-SD (1), 2-SD-T (3) |
| 12-SD | 05 | 12-SD (2), 12-SD-T (4) |
| 9-SD | 06 | 9-SD (1 asmuo) |
| PT | 15 | PT + priedai PT-1-SD, PT-2-SD, PT-SAM3SD ir kt. |

Kiekviename JSON:
- `FormDefId` — įrašomas į `<Form FormDefId="...">`
- `groups` — `<DocumentPages>` struktūra
- `pages.<lapas>.header_fields` — vienkartiniai laukai
- `pages.<lapas>.row_fields` — eilučių laukai, `{N}` = eilutės nr. lape (1..rows_per_page)
- `pages.<lapas>.field_count` — kiek `<Field>` turi būti lape (privalomi VISI, net tušti)
- `reason_codes` — priežasčių klasifikatorius iš šablono

Formatai: skaičiai su kableliu (1500,00), datos YYYY-MM-DD, UTF-8.

`reference/*.validation.vbs` — originali Sodra šablonų tikrinimo logika (VBScript), naudoti kaip etaloną validacijai.
