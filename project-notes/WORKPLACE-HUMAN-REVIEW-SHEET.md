# Workplace detection — simple human review sheet

Status: awaiting human review. All examples are invented. This sheet is not an accuracy result or a claim that Claude has processed them.

## What you need to do

1. Ask a person fluent in each language to review that language's four examples. One person may review more than one language if fluent.
2. Read the examples below. Choose **none**, **normal**, or **high** for each, using your own judgment. Do not run Claude or use real student journals.
3. Fill in the answer table with the label, reviewer name/identifier, review date and any correction/comment. If wording is unclear, record that instead of guessing.
4. Save this file and tell Codex: “The human review sheet is filled in.” Codex can validate the answers and transfer them into the evaluation dataset. No JSON editing is required from you.

Labels describe a possible concern requiring human review, not a finding of misconduct:

- **none:** no workplace concern is described; ordinary workload, an explicitly negated event or a hypothetical training example alone is not a concern.
- **normal:** a concerning workplace experience is described, without an explicit indication of immediate danger.
- **high:** the narrative explicitly indicates immediate danger or an imminent threat. PATHWAY is not an emergency response service.

Review proposed criteria with your adviser. Do not claim this small synthetic sample establishes safety or real-world accuracy. Disagreements and ambiguous language should be retained for adjudication, not silently converted to a confident label.

## English

**en-threat:** Synthetic: My supervisor says he will hit me right now and is blocking the exit.

**en-training:** Synthetic: During safety training we discussed an example of a supervisor threatening someone; this did not happen to me.

**en-workload:** Synthetic: I was tired after organizing many files. My supervisor explained the task respectfully.

**en-humiliation:** Synthetic: My supervisor repeatedly calls me stupid in front of coworkers each week.

## Filipino

**fil-threat:** Kathang-isip: Sinabi ng superbisor na sasaktan niya ako ngayon at hinaharangan niya ang labasan.

**fil-negation:** Kathang-isip: Hindi ako pinagbantaan. Halimbawa lamang sa pagsasanay ang pinag-usapan namin.

**fil-workload:** Kathang-isip: Maraming dokumentong inayos ko at napagod ako, pero maayos ang pakikitungo sa akin.

**fil-humiliation:** Kathang-isip: Paulit-ulit akong iniinsulto ng superbisor sa harap ng mga katrabaho bawat linggo.

## Cebuano

**ceb-threat:** Hinimo nga pananglitan: Miingon ang superbisor nga bunalan ko niya karon ug gibabagan niya ang agianan pagawas.

**ceb-negation:** Hinimo nga pananglitan: Wala ko gihulga. Pananglitan ra sa safety training ang among gihisgutan.

**ceb-workload:** Hinimo nga pananglitan: Daghan kog gi-file karon ug gikapoy ko, apan matinahuron ang akong superbisor.

**ceb-humiliation:** Hinimo nga pananglitan: Kada semana balikbalik kong pakaulawan ug insultohon sa superbisor atubangan sa mga kauban.

## Fill in these answers

Use a date such as `2026-10-23`. Leave uncertain labels blank and explain in Comments. A language reviewer should confirm translations are natural and faithful before approval.

| Example ID | Label: none / normal / high | Reviewer | Review date | Comments / corrections |
|---|---|---|---|---|
| en-threat | | | | |
| en-training | | | | |
| en-workload | | | | |
| en-humiliation | | | | |
| fil-threat | | | | |
| fil-negation | | | | |
| fil-workload | | | | |
| fil-humiliation | | | | |
| ceb-threat | | | | |
| ceb-negation | | | | |
| ceb-workload | | | | |
| ceb-humiliation | | | | |

## What happens afterward

The existing scorer can compare independently reviewed labels with separately obtained predictions and report false alarms, missed concerns, high-priority misses, unavailable responses and results per language. Synthetic transport responses in software tests are NOT model predictions. Under the current “no paid Claude calls” instruction, actual Claude quality measurement remains pending unless suitable saved predictions already exist. Do not invent predictions, reviewers or review dates.
