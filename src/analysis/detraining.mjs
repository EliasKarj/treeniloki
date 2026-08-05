/** One-line, normal-not-alarming detraining context for a break of `gapDays`. null if <14d. */
export function detrainingNote(gapDays) {
  if (gapDays < 14) return null;
  if (gapDays < 21) return "~2 vk tauko: pieni notkahdus tahtiin on odotettavaa — fysiologisesti normaalia.";
  if (gapDays < 42) return "~2–3 vk tauko: odota noin 6–7 % VO2max-laskua. Tämä on normaalia, ei merkki virheestä.";
  if (gapDays < 63) return "~1–1,5 kk tauko: kunto on laskenut selvästi mutta palautuu rakenteellisella paluulla — normaalia.";
  return "2+ kk tauko: jopa ~20 % VO2max-lasku on tässä kohtaa normaalia. Aloita maltilla, kunto palaa.";
}
