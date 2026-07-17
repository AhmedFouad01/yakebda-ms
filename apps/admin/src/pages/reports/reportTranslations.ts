import { t as baseText } from "../../lib/t";
import { reportText } from "./reportText";

export const reportTranslations = {
  ...baseText,
  reports: {
    ...baseText.reports,
    ...reportText,
  },
};
