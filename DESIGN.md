# Troy LLM operator page

This single English-language operator page serves club members and officers.
Preserve its plain system-font layout and native controls; this is a verification
tool, not a marketing site. `public/index.html` owns visual styles: 760px content,
16px system text, #17202a foreground, #52606d secondary text, #ccd3db dividers,
and #f2f5f8 output surfaces. No parallel token system is needed.

`src/operator.js` owns form handling, status feedback, and membership rendering.
Approval feedback belongs beside the approval controls and includes the exact
service error. Keep entered values on failure and prevent simultaneous approvals.
Select pending members by their displayed identity and stored UID. A successful
approval requires server readback; member status follows the live document.

`src/points.js` owns Firebase operations; `firestore.rules` owns authorization.
Approval remains an officer-only pending-to-member transition with audit fields.
Other operator actions retain their existing global Result feedback. Native
select geometry is accepted for the existing activity and award forms.
