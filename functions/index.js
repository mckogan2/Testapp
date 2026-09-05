// Notification digest for the family grocery list app.
//
// Two functions:
//   logCheckedChanges — fires on every write to a family's `checked` map
//     (the item-toggle data the app already writes) and keeps ONE record
//     per item, holding the state that item started the window in and
//     the state it's in now.
//   sendDigest — runs every 3 minutes; reports only the items whose
//     state actually differs from where the window started, then clears
//     the records. A quiet 3-minute window sends nothing.
//
// Tracking state per item rather than logging each tap matters: ticking
// an item on and off again three times is six writes but zero net
// change, and should produce no notification at all.
//
// These are 2nd gen (Cloud Run backed) functions. 1st gen deploys fail
// on this project because they depend on the legacy Cloud Build default
// service account, which newer Firebase projects no longer get —
// surfacing as an opaque "GetDefaultServiceAccount" permission error
// that no amount of IAM granting fixes.
//
// Pending changes and device tokens live under /notifyState/{familyKey},
// deliberately separate from /families/{familyKey} — the app's own
// saveToDB() overwrites that whole node on every save (checked,
// customItems, lastPurchaseTime, eventLists together), which would wipe
// out any bookkeeping stored alongside it.

const { onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.database();

const REGION = "us-central1";

exports.logCheckedChanges = onValueWritten(
  { ref: "/families/{familyKey}/checked", region: REGION },
  async (event) => {
    const { familyKey } = event.params;
    const before = event.data.before.val() || {};
    const after = event.data.after.val() || {};

    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const work = [];

    keys.forEach((key) => {
      const wasChecked = !!before[key];
      const isChecked = !!after[key];
      if (wasChecked === isChecked) return;

      const [cat, item] = key.includes("||") ? key.split("||") : ["", key];

      // One record per item, not per tap. Item names contain characters
      // that are illegal in database keys (". / # $ [ ]"), so the key is
      // base64url-encoded — reversible, and collision-free.
      const entryId = Buffer.from(key, "utf8").toString("base64url");
      const ref = db.ref(`/notifyState/${familyKey}/pendingChanges/${entryId}`);

      // A transaction, so two rapid taps can't race and both decide
      // they were the first one (which would lose the original `before`).
      work.push(
        ref.transaction((current) => {
          if (current === null) {
            // First change to this item this window: remember the state
            // it started from, so we can tell later whether the net
            // effect was actually anything.
            return { cat, item, before: wasChecked, after: isChecked, at: Date.now() };
          }
          // Already changed this window: keep the original `before`,
          // only the latest state matters.
          current.after = isChecked;
          current.at = Date.now();
          return current;
        })
      );
    });

    await Promise.all(work);
  }
);

exports.sendDigest = onSchedule(
  { schedule: "every 3 minutes", region: REGION },
  async () => {
    const snap = await db.ref("/notifyState").once("value");
    const state = snap.val() || {};

    const work = Object.entries(state).map(async ([familyKey, familyState]) => {
      const pending = familyState.pendingChanges;
      if (!pending) return;

      // Only report items whose state actually differs from where the
      // window started. Ticking something on and back off again is a
      // no-op and shouldn't be announced. (Entries written by the older
      // per-tap version have no `before`/`after` and drop out here,
      // which is the behaviour we want for any leftovers.)
      const entries = Object.values(pending).filter((e) => e.before !== e.after);

      const deviceTokens = familyState.deviceTokens || {};
      const tokenIds = Object.keys(deviceTokens);
      const tokens = tokenIds.map((id) => deviceTokens[id].token).filter(Boolean);

      if (entries.length > 0 && tokens.length > 0) {
        const checkedOn = entries.filter((e) => e.after).map((e) => e.item);
        const checkedOff = entries.filter((e) => !e.after).map((e) => e.item);

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
  }
);
