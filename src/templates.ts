/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CriteriaLevel, EvaluationTemplate } from "./types";

export const EXAM_CRITERIA_LEVELS = [
  {
    level: CriteriaLevel.LEVEL_1_2,
    title: "Niveau 1-2 (Limité)",
    description: "L'élève interprète des données d'une manière limitée. Évaluation de pertinence très restreinte, conclusions peu justifiées.",
  },
  {
    level: CriteriaLevel.LEVEL_3_4,
    title: "Niveau 3-4 (Rudimentaire)",
    description: "Interprète des données et explique des tendances simples. Évaluation rudimentaire, conclusions pertinentes mais sans justification scientifique approfondie.",
  },
  {
    level: CriteriaLevel.LEVEL_5_6,
    title: "Niveau 5-6 (Satisfaisant)",
    description: "Interprète avec précision, explique les relations. Évalue la fiabilité de manière satisfaisante. Conclusions scientifiquement justifiées.",
  },
  {
    level: CriteriaLevel.LEVEL_7_8,
    title: "Niveau 7-8 (Excellent / Critique)",
    description: "Interprétation précise et complexe. Analyse critique approfondie de la fiabilité des données. Conclusions complètes avec prise en compte des limites.",
  },
];

export const PRELOADED_TEMPLATES: EvaluationTemplate[] = [
  {
    id: "page3",
    title: "Exercice 1 : Analyse de la consommation électrique",
    pageNumber: 3,
    imageUrl: "page3_bg", // generated or drawn dynamically
    questions: [
      {
        id: "ex1_q1",
        number: 1,
        questionText: "1. Calculez le coût total de l'électricité consommée pendant cette période.",
        defaultX: 12,
        defaultY: 31,
        maxWidth: 580,
        lineHeight: 28,
      },
      {
        id: "ex1_q2",
        number: 2,
        questionText: "2. Calculez la consommation électrique moyenne par jour en kWh.",
        defaultX: 12,
        defaultY: 48,
        maxWidth: 580,
        lineHeight: 28,
      },
      {
        id: "ex1_q3",
        number: 3,
        questionText: "3. Si le coût du kWh augmentait de 20%, quel serait le nouveau coût total de l'électricité (hors abonnement) pour la même consommation ?",
        defaultX: 12,
        defaultY: 67,
        maxWidth: 580,
        lineHeight: 28,
      },
      {
        id: "ex1_q4",
        number: 4,
        questionText: "4. Déduisez une conclusion sur l'importance de la gestion de l'énergie électrique pour un foyer, en vous basant sur vos calculs.",
        defaultX: 12,
        defaultY: 84,
        maxWidth: 580,
        lineHeight: 24,
      },
    ],
  },
  {
    id: "page4",
    title: "Exercice 2 : Évaluation de la fiabilité (Partie 1)",
    pageNumber: 4,
    imageUrl: "page4_bg",
    questions: [
      {
        id: "ex2_q1",
        number: 1,
        questionText: "1. Évaluez la pertinence et la fiabilité de l'Extrait A. Justifiez votre réponse en vous basant sur la source et le contenu.",
        defaultX: 12,
        defaultY: 65,
        maxWidth: 580,
        lineHeight: 24,
      },
      {
        id: "ex2_q2",
        number: 2,
        questionText: "2. Évaluez la pertinence et la fiabilité de l'Extrait B. Justifiez votre réponse en vous basant sur la source et le contenu.",
        defaultX: 12,
        defaultY: 86,
        maxWidth: 580,
        lineHeight: 24,
      },
    ],
  },
  {
    id: "page5",
    title: "Exercice 2 : Évaluation de la fiabilité (Partie 2)",
    pageNumber: 5,
    imageUrl: "page5_bg",
    questions: [
      {
        id: "ex2_q3",
        number: 3,
        questionText: "3. En vous basant sur votre évaluation des deux extraits, quelle conclusion pouvez-vous tirer concernant l'approche à adopter pour s'informer sur les sources d'énergie ?",
        defaultX: 12,
        defaultY: 28,
        maxWidth: 580,
        lineHeight: 24,
      },
    ],
  },
];

// Pre-defined answers modeled after the teacher's Criterion C grading rubric for the AI engine
export const RUBRIC_ANSWERS: { [key in CriteriaLevel]: { [qId: string]: string } } = {
  [CriteriaLevel.LEVEL_1_2]: {
    ex1_q1: "Calcul : 900 x 0,15 = 135 euros.\nRéponse : Le coût total est de 135 €.",
    ex1_q2: "Calcul : 900 / 30 = 30 kWh.\nRéponse : L'élève consomme en moyenne 30 kWh par jour environ.",
    ex1_q3: "Calcul : 135 + 20% = 155 €.\nRéponse : Ça coûtera 155 €.",
    ex1_q4: "Réponse : Gérer l'électricité est important parce qu'il faut éteindre la lumière pour pas gaspiller et que ça coûte moins cher à maman et papa à la fin de l'année.",
    ex2_q1: "Réponse : L'extrait A n'est pas très bien parce que c'est juste un blog récent écrit sur Internet sans nom d'auteur officiel. Mais l'éolien est propre et n'a pas de défauts donc l'article a raison d'en parler.",
    ex2_q2: "Réponse : L'extrait B est plus sérieux car c'est un rapport du gouvernement du pays. C'est plus fiable mais c'est dommage qu'il parle encore de déchets nucléaires et de sécurité compliquée.",
    ex2_q3: "Réponse : Il faut juste lire les rapports sérieux du gouvernement ou de l'école et ne pas trop faire confiance aux blogs rigolos que n'importe qui peut écrire sur Internet.",
  },
  [CriteriaLevel.LEVEL_3_4]: {
    ex1_q1: "Calcul : Consommation = 900 kWh x 0,15 € = 135 €. Avec l'abonnement : 135 € + 30 € = 165 €.\nRéponse : Le coût total de l'électricité pendant cette période de facturation est de 165 €.",
    ex1_q2: "Calcul : Nombre de jours de la période (janvier à mars) = 31 + 28 + 31 = 90 jours. Consommation moyenne par jour = 900 kWh / 90 jours = 10 kWh/jour.\nRéponse : La consommation moyenne d'électricité par jour est de 10 kWh.",
    ex1_q3: "Calcul : Coût sans abonnement = 135 € surconsommé. Hausse de 20% du tarif de base par kWh : 0,15 € x 1,2 = 0,18 € / kWh. Nouveau coût = 900 kWh x 0,18 € = 162 €.\nRéponse : Le nouveau coût total de l'électricité hors abonnement serait de 162 €.",
    ex1_q4: "Réponse : C'est important de gérer l'électricité pour faire des économies. Mes calculs montrent que si les prix augmentent de 20%, le coût passe de 135 € à 162 € sans l'abonnement (+27 €). Donc réduire notre consommation permet de payer moins cher.",
    ex2_q1: "Réponse : L'extrait A est peu fiable car il provient d'un simple 'article de blog récent'. Le contenu est très subjectif et exagéré, affirmant que l'éolienne est la solution 'parfaite' 'sans aucun inconvénient', ce qui est scientifiquement faux (problème d'intermittence, impact paysage).",
    ex2_q2: "Réponse : L'extrait B est moyennement ou assez fiable car c'est un 'rapport gouvernemental'. Il présente plusieurs points de vue, comme les avantages ('bas-carbone') et les inconvénients ('déchets radioactifs' et 'mesures de sécurité'). C'est beaucoup plus réaliste et sérieux.",
    ex2_q3: "Réponse : Pour bien s'informer sur les sources d'énergie, il ne faut pas croire un blog qui n'a pas d'arguments et qui dit que tout est parfait. On doit lire des rapports gouvernementaux qui se reposent sur de vraies données scientifiques.",
  },
  [CriteriaLevel.LEVEL_5_6]: {
    ex1_q1: "Calcul :\nCoût de la consommation : 900 kWh x 0,15 €/kWh = 135 €\nAbonnement fixe pour la période : 30 €\nCoût total = 135 € + 30 € = 165 €\nRéponse : Le coût total de l'électricité pour la période facturée du 1er janvier au 31 mars s'élève à 165 €.",
    ex1_q2: "Calcul :\nDurée totale de facturation : Janvier (31 jours) + Février (28 jours) + Mars (31 jours) = 90 jours au total.\nConsommation moyenne par jour : 900 kWh / 90 jours = 10 kWh par jour.\nRéponse : La consommation électrique moyenne du foyer est de 10 kWh par jour.",
    ex1_q3: "Calcul :\nNouveau prix du kWh (+20%) : 0,15 € x 1,20 = 0,18 €/kWh.\nNouveau coût total (hors abonnement) : 900 kWh x 0,18 €/kWh = 162 €.\n(Surcoût de : 162 € - 135 € = 27 €).\nRéponse : Le coût total de l'électricité consommée (hors abonnement) s'élèverait à 162 €.",
    ex1_q4: "Réponse : La gestion de l'énergie électrique est cruciale pour un foyer. Nos calculs indiquent qu'une augmentation de 20% du prix du kWh engendre un surcoût direct de 27 € sur la facture d'un même trimestre (162 € contre 135 €). Maîtriser sa consommation permet aux ménages d'amortir cette vulnérabilité économique, tout en agissant de façon éco-responsable.",
    ex2_q1: "Réponse : L'extrait A présente une fiabilité extrêmement faible. Il provient d'un simple blog personnel, qui n'est pas une source institutionnelle validée par des pairs. De plus, son contenu manque cruellement d'objectivité scientifique : prétendre qu'un système énergétique est 'parfait' et 'ne présente aucun inconvénient' relève d'une démagogie simpliste plutôt que d'une analyse technique sérieuse.",
    ex2_q2: "Réponse : L'extrait B présente une fiabilité très satisfaisante. Sa source est un 'rapport gouvernemental d'une stratégie nationale', de nature officielle. Le contenu est équilibré, identifiant la production 'bas-carbone' tout en mentionnant les contraintes critiques ('gestion des déchets radioactifs', 'sécurité rigoureuse'). Il s'appuie explicitement sur des études d'impact environnemental et des statistiques fiables issues de l'AIEA (Agence Internationale de l'Énergie Atomique).",
    ex2_q3: "Réponse : Pour s'informer de façon rigoureuse, il est impératif d'écarter les opinions unilatérales véhiculées par des médias non spécialistes (blogs d'opinion) pour privilégier des études institutionnelles neutres (rapports officiels s'appuyant sur des organismes reconnus comme l'AIEA). L'analyse scientifique d'une énergie exige d'en analyser les bénéfices et les inconvénients de façon factuelle.",
  },
  [CriteriaLevel.LEVEL_7_8]: {
    ex1_q1: "Calcul :\n• Coût de consommation variable : 900 kWh × 0,15 €/kWh = 135,00 €\n• Abonnement fixe pour la période : 30,00 €\n• Coût global = 135,00 € + 30,00 € = 165,00 €\nRéponse : En tenant compte de la part variable et de l'abonnement, le coût total est de 165,00 €.",
    ex1_q2: "Calcul :\n• Nombre exact de jours du 1er janvier au 31 mars (année non-bissextile par défaut) : 31 (janv.) + 28 (févr.) + 31 (mars) = 90 jours.\n• Consommation moyenne journalière = 900 kWh / 90 jours = 10,0 kWh/jour.\nRéponse : La consommation moyenne s'établit précisément à 10,0 kWh/jour pour cette période.",
    ex1_q3: "Calcul :\n• Prix unitaire de départ du kWh : 0,15 €\n• Prix après augmentation de 20% : 0,15 € × 1,20 = 0,18 € / kWh.\n• Nouveau coût hors taxes/abonnement : 900 kWh × 0,18 € = 162,00 €.\n• Analyse comparative : On observe une hausse nette de 27,00 € (162 € au lieu de 135 €).\nRéponse : Le coût total hors abonnement pour cette même consommation serait de 162,00 €.",
    ex1_q4: "Réponse : L'analyse quantitative montre que la facture énergétique d'un foyer est particulièrement sensible aux fluctuations tarifaires du marché. Une hausse de 20% du kWh engendre instantanément une augmentation de 20% des coûts de consommation (+27 €/trimestre). Dans un contexte potentiel de forte volatilité des prix ou de transition écologique, la gestion proactive de la consommation (optimisation des appareils, isolation, réduction des gaspillages) est indispensable pour préserver le pouvoir d'achat du foyer tout en limitant l'empreinte carbone liée aux transformations énergétiques.",
    ex2_q1: "Réponse : L'extrait A possède une pertinence et une fiabilité très limitées. Source : Il s'agit d'un récent 'article de blog' sans mention d'auteur qualifié, ce qui n'offre aucune garantie de validation scientifique ou d'approbation institutionnelle. Contenu : Le discours est dogmatique, polarisé et simpliste. L'affirmation selon laquelle les éoliennes 'ne produisent aucune pollution, sont entièrement renouvelables et ne présentent aucun inconvénient' ignore délibérément la réalité du cycle de vie des turbines (fabrication des pales, utilisation de terres rares) et l'impératif physique d'intermittence réseau. Il s'agit d'une communication d'opinion partisane dénuée de rigueur scientifique.",
    ex2_q2: "Réponse : L'extrait B présente une pertinence élevée et une fiabilité robuste. Source : Rapport gouvernemental s'alignant sur des données probantes de l'AIEA (Agence Internationale de l'Énergie Atomique), une entité faisant autorité mondiale. Contenu : L'approche est nuancée, méthodique et objective. L'extrait valide les atouts indéniables du nucléaire ('bas-carbone') tout en admettant lucidement la complexité systémique inhérente à cette filière ('gestion des déchets radioactifs', 'sécurité rigoureuse'). L'intégration d'études d'impact environnemental confirme la démarche d'évaluation scientifique rigoureuse axée sur la durabilité.",
    ex2_q3: "Réponse : Cette étude comparée démontre que l'acquisition de connaissances fiables en matière de politique ou d'ingénierie énergétique nécessite une vigilance méthodologique active. Il convient d'adopter une approche critique systématique : d'une part, en identifiant et récusant les sources d'opinion biaisées ou superficielles (comme l'Extrait A) qui occultent les contraintes physiques ; d'autre part, en croisant les rapports institutionnels de référence (comme l'Extrait B) qui évaluent honnêtement les relations complexes de bénéfices/risques. L'information scientifique exige d'analyser le cycle de vie global et d'évaluer la représentativité des bases de données exploitées, tout en tenant compte de leurs limites intrinsèques.",
  },
};
