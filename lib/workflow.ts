/** Roles and the submission status flow. Pure rules, no database: the API checks every action against these. */
export const ROLES = ["creator", "manager", "reviewer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ["draft", "in_review", "changes_requested", "approved"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

export const ROLE_LABEL: Record<Role, string> = { creator: "Creator", manager: "Manager", reviewer: "Reviewer", admin: "Admin" };

const isReviewer = (r: Role) => r === "manager" || r === "reviewer" || r === "admin";

/** Who can see a submission: its author, and anyone who reviews. Creators never see each other's drafts. */
export function canView(role: Role, isAuthor: boolean): boolean {
  return isAuthor || isReviewer(role);
}

/** Only the author edits the text, and only while it is a draft or changes were asked for. */
export function canEditText(isAuthor: boolean, status: Status): boolean {
  return isAuthor && (status === "draft" || status === "changes_requested");
}

/** Returns why a status change is not allowed, or null when it is. Nobody approves their own work. */
export function transitionError(args: { role: Role; isAuthor: boolean; from: Status; to: Status }): string | null {
  const { role, isAuthor, from, to } = args;
  if (from === to) return "It is already " + STATUS_LABEL[to].toLowerCase() + ".";
  if (to === "in_review") {
    if (from !== "draft" && from !== "changes_requested") return "Only a draft, or one with changes requested, can be sent for review.";
    return isAuthor || role === "admin" ? null : "Only the author can send this for review.";
  }
  if (to === "approved" || to === "changes_requested") {
    if (from === "approved" && to === "changes_requested") return role === "manager" || role === "admin" ? null : "Only a manager or admin can reopen an approved submission.";
    if (from !== "in_review") return "It has to be in review first.";
    if (!isReviewer(role)) return "Only a manager, reviewer or admin can decide.";
    if (isAuthor) return "You can't decide on your own submission.";
    return null;
  }
  return "That change isn't allowed.";
}
