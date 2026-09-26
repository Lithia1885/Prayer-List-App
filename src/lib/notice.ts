/* The standing notice shown at the top of the app.
 *
 * Everything the notice says lives here, so changing it is one file.
 *
 * To announce the date: edit the copy below AND bump NOTICE_ID to the next
 * version ("move-v2"). The acknowledgement rows in SharePoint are keyed by
 * this id, so a new id means nobody has read the new wording yet and everyone
 * sees it again. Editing the copy WITHOUT bumping the id changes the words
 * for people who have already dismissed it and they will never see them.
 */

export const NOTICE_ID = "move-v1";

export const NOTICE_HEADING = "Coming soon: a new home for the prayer list";

// Line breaks are meaningful — rendered with `whitespace-pre-line` exactly as
// written here, so the three promises stay on three lines.
export const NOTICE_BODY = `The prayer list is moving to a new home. It's the same list with the
same requests, just faster.

I'll close this version on a Saturday night.
I'll announce the date here in advance so you can be ready.
I'll be at church Sunday morning to help you find the new one.

If a new prayer request comes in that night, please jot it down and
add it on Sunday.

Please pass this along to anyone else who uses the prayer list.

— Bart`;

export const NOTICE_ACKNOWLEDGE = "OK, I've read this";

export const NOTICE_COLLAPSED = "The prayer list is moving soon. Tap to read more.";
