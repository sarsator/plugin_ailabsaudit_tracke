# Merchant consent templates

Six templates, one per language, for the Shopify measurement pilot. `fr.md` is
the **canonical version**: change the substance there first, then propagate.

| file | language |
|---|---|
| `fr.md` | French *(canonical)* |
| `nl.md` | Dutch |
| `it.md` | Italian |
| `ja.md` | Japanese |
| `ko.md` | Korean |
| `en.md` | English |

These are localisations, not translations. Tone, politeness level and degree of
formality follow each language's own conventions; the substantive commitments are
identical, and that is enforced by the parity check rather than by inspection.

## Parity check

    python3 verify_parity.py      # must print: 0 rubrique(s) manquante(s)

It looks for fifteen substantive commitments in every document, with one match
pattern per language. A missing rubric means either a localisation slip or a
divergence in substance — both block sending.

Run it after any edit. A change made to `fr.md` alone will fail it.

## Placeholders

Fill before sending — each language uses its own:

`[DATE]` · start date · estimated end date · duration · contact email · phone ·
store name.

## What the templates deliberately say

Three commitments exist because leaving them out would have made the consent
ambiguous, and an ambiguous consent is worse than a merchant declining:

- **the product limit is stated plainly** — we cannot see which pages of the
  store are crawled, Shopify does not allow it, and we do not claim it;
- **variant B is announced as visible**, because it is the only part of the pilot
  that changes how the store looks;
- **the control address is announced too**, even though nothing links to it and
  nothing about it is visible.

No merchant is named in this directory. Store names, cohort assignment and who
accepted which variant are operational data and are kept out of this repository.
