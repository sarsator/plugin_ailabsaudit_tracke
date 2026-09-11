# Regle de cohorte — pilote Shopify AI Agent Monitor

## Cohorte principale (crossover) — H + B

Marchands ayant accepte les deux variantes. Ils recoivent H puis B, ou B puis H,
selon un ordre tire au sort, avec bascule a mi-parcours. **Eux seuls** alimentent
la comparaison causale H contre B, chaque boutique servant de temoin a elle-meme.

## Cohorte H-only

Marchands ayant refuse B. Ils restent dans le pilote et alimentent :

- la faisabilite de H — un agent suit-il un `<link rel>` dans le `<head>` ;
- la mesure du bruit de fond via l'adresse temoin ;
- la validation operationnelle : installation, presence du lien, stabilite du rendu.

Ils **n'entrent pas** dans l'analyse comparative H contre B. Leurs donnees ne sont
jamais fusionnees avec celles du crossover dans un meme calcul d'ecart.

## Interdit explicite

Ne **jamais** compenser un refus de B en modifiant la randomisation des autres
boutiques. Le tirage au sort est arrete avant le debut, sur la seule cohorte
crossover, et n'est pas reajuste en cours de route. Un desequilibre se rapporte,
il ne se rattrape pas.

## Consequence a assumer d'avance

Avec 7 boutiques candidates : si **3 ou plus refusent B**, la cohorte crossover
tombe sous 4 boutiques et la comparaison H/B devient **exploratoire**. Le pilote
garde alors toute sa valeur comme preuve de faisabilite de H — son premier
objectif — mais aucun ecart H/B ne pourra etre presente comme un resultat etabli.

Cela doit figurer dans le rapport final, quel que soit le resultat.
