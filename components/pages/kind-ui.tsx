import type { IconType } from "react-icons";
import { LuBriefcase, LuCalendarDays, LuFileText, LuFiles, LuIdCard, LuImages, LuLink, LuMegaphone, LuPresentation, LuShare2, LuShoppingBag, LuStore, LuTicketPercent, LuUtensils } from "react-icons/lu";
import type { PageKind } from "@/lib/pages/kinds";

/** One icon per page kind (Lucide, via react-icons). Used by the "New page" chooser and anywhere else a kind is shown with a symbol. */
export const KIND_ICON: Record<PageKind, IconType> = {
  card: LuIdCard, business: LuStore, links: LuLink, social: LuShare2, resume: LuBriefcase,
  document: LuFileText, collection: LuFiles, gallery: LuImages, presentation: LuPresentation,
  menu: LuUtensils, product: LuShoppingBag, event: LuCalendarDays, campaign: LuMegaphone, coupon: LuTicketPercent,
};
/** Chooser grouping. Only kinds that are built appear; the identifiers are the stored page kinds and never change. */
export const KIND_GROUPS: { id: string; title: string; kinds: PageKind[] }[] = [
  { id: "people", title: "People and contact", kinds: ["card", "business", "links", "social", "resume"] },
  { id: "files", title: "Files and media", kinds: ["document", "collection", "gallery", "presentation"] },
  { id: "promote", title: "Sell and promote", kinds: ["menu", "product", "event", "campaign", "coupon"] },
];
