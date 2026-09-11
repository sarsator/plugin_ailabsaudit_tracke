#!/usr/bin/env python3
"""Verifie que les huit documents de consentement portent les memes engagements.

Chaque rubrique est cherchee via une liste de motifs — un par langue. Un document
auquel il manque une rubrique signale soit un oubli de localisation, soit une
divergence de fond : les deux sont bloquants avant envoi.

    python3 verifier_parite.py      # 0 si tout est present
"""
import glob
import os
import sys

RUBRIQUES = {
    "limite honnete": ["ne voyons pas", "zien niet", "Non vediamo",
                       "把握することはできません", "확인할 수 없습니다", "cannot see"],
    "duree + placeholder": ["[DATE DE DÉBUT]", "[STARTDATUM]", "[DATA DI INIZIO]",
                            "[開始日]", "[시작일]", "[START DATE]"],
    "App Embed": ["App Embed"],
    "App Proxy": ["App Proxy"],
    "variante H": ["Variante H", "Variant H", "パターン H", "방식 H"],
    "variante B visible": ["visible par vos visiteurs", "zichtbaar voor uw bezoekers",
                           "visibile ai Suoi visitatori", "見える形で表示されます",
                           "방문자에게 보입니다", "visible to your shoppers"],
    "adresse temoin": ["adresse témoin", "controleadres", "indirizzo di controllo",
                       "対照用のアドレス", "대조용 주소", "control address"],
    "refus de B": ["uniquement en variante H", "uitsluitend met variant H",
                   "solo con la variante H", "パターン H のみ", "방식 H로만",
                   "variant H only"],
    "IP non conservee": ["n'est pas conservée", "wordt niet bewaard",
                         "non viene conservato", "保存されません", "보관하지 않으며",
                         "not retained"],
    "aucune garantie": ["ne garantissons aucune", "garanderen geen", "Non garantiamo",
                        "お約束するもの", "보장하지 않습니다", "guarantee no improvement"],
    "retrait sans consequence": ["aucune conséquence sur votre compte",
                                 "geen enkel gevolg voor uw AI Labs Audit-account",
                                 "alcuna conseguenza sul Suo account",
                                 "影響が及ぶことは一切ございません",
                                 "어떠한 영향도 발생하지 않습니다",
                                 "no consequence for your AI Labs Audit account"],
    "cleanup apres desinstallation": ["références techniques de configuration",
                                      "technische configuratieverwijzingen",
                                      "riferimenti tecnici di configurazione",
                                      "技術的な参照を残す", "기술 참조를 남길",
                                      "technical configuration references"],
    "confidentialite": ["sans votre autorisation explicite",
                        "zonder uw uitdrukkelijke toestemming",
                        "senza la Sua autorizzazione esplicita", "明示的なご許可なく",
                        "명시적 허가 없이", "without your explicit permission"],
    "contact": ["AI Labs Solutions"],
    "formulaire de reponse": ["☐"],
}


def main():
    racine = os.path.dirname(os.path.abspath(__file__))
    fichiers = sorted(glob.glob(os.path.join(racine, "*.md")))
    fichiers = [f for f in fichiers if not f.endswith("README.md")]
    if not fichiers:
        sys.exit("aucun document trouve")

    textes = {f: open(f, encoding="utf-8").read() for f in fichiers}
    manquants = []
    for rubrique, motifs in RUBRIQUES.items():
        for f, t in textes.items():
            if not any(m in t for m in motifs):
                manquants.append((os.path.basename(f), rubrique))

    for nom, rubrique in manquants:
        print(f"MANQUE  {nom}  ->  {rubrique}")
    print(f"{len(fichiers)} documents, {len(RUBRIQUES)} rubriques, "
          f"{len(manquants)} rubrique(s) manquante(s)")
    return 1 if manquants else 0


if __name__ == "__main__":
    sys.exit(main())
