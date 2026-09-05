// Notification digest for the family grocery list app.
//
// Two functions:
//   logCheckedChanges — fires on every write to a family's `checked` map
//     (the item-toggle data the app already writes) and records one
//     pending-change entry per item that flipped.
//   sendDigest — runs every 3 minutes; for any family with pending
//     changes, sends ONE push notification summarizing all of them, then
//     clears the log. A quiet 3-minute window sends nothing.
//
// Pending changes and device tokens live under /notifyState/{familyKey},
// deliberately separate from /families/{familyKey} — the app's own
// saveToDB() overwrites that whole node on every save (checked,
// customItems, lastPurchaseTime, eventLists together), which would wipe
// out any bookkeeping stored alongside it.

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.database();

exports.logCheckedChanges = functions.database
  .ref("/families/{familyKey}/checked")
  .onWrite(async (change, context) => {
    const { familyKey } = context.params;
    const before = change.before.val() || {};
    const after = change.after.val() || {};

    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const updates = {};

    keys.forEach((key) => {
      const wasChecked = !!before[key];
      const isChecked = !!after[key];
      if (wasChecked === isChecked) return;

      const [cat, item] = key.includes("||") ? key.split("||") : ["", key];
      const pushId = db.ref().push().key;
      updates[`/notifyState/${familyKey}/pendingChanges/${pushId}`] = {
        cat,
        item,
        checked: isChecked,
        at: admin.database.ServerValue.TIMESTAMP,
      };
    });

    if (Object.keys(updates).length === 0) return null;
    return db.ref().update(updates);
  });

exports.sendDigest = functions.pubsub
  .schedule("every 3 minutes")
  .onRun(async () => {
    const snap = await db.ref("/notifyState").once("value");
    const state = snap.val() || {};

    const work = Object.entries(state).map(async ([familyKey, familyState]) => {
      const pending = familyState.pendingChanges;
      if (!pending) return;

      const entries = Object.values(pending);
      const deviceTokens = familyState.deviceTokens || {};
      const tokenIds = Object.keys(deviceTokens);
      const tokens = tokenIds.map((id) => deviceTokens[id].token).filter(Boolean);

      if (entries.length > 0 && tokens.length > 0) {
        const checkedOn = entries.filter((e) => e.checked).map((e) => e.item);
        const checkedOff = entries.filter((e) => !e.checked).map((e) => e.item);

        const parts = [];
        if (checkedOn.length) parts.push(`נבחרו: ${checkedOn.join(", ")}`);
        if (checkedOff.length) parts.push(`בוטלו: ${checkedOff.join(", ")}`);

        const title = entries.length === 1
          ? "עודכן פריט ברשימת הקניות"
          : `${entries.length} פריטים עודכנו ברשימת הקניות`;

        const response = await admin.messaging().sendEachForMulticast({
          notification: { title, body: parts.join(" · ") },
          tokens,
        });

        const tokenUpdates = {};
        response.responses.forEach((result, i) => {
          if (!result.success) {
            tokenUpdates[`/notifyState/${familyKey}/deviceTokens/${tokenIds[i]}`] = null;
          }
        });
        if (Object.keys(tokenUpdates).length > 0) {
          await db.ref().update(tokenUpdates);
        }
      }

      await db.ref(`/notifyState/${familyKey}/pendingChanges`).remove();
    });

    await Promise.all(work);
    return null;
  });
