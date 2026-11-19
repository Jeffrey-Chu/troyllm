import { db, makeAuth, friendlyError } from './common.js';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

const A = makeAuth('superdw');
const ref = (...p) => doc(db, 'sites', 'superdw', ...p);
const cut = (s, n) => String(s ?? '').trim().slice(0, n);

window.DW = {
  ...A,
  signIn: A.signIn,
  onUser: A.onUser,
  friendlyError,
  // Saves an order request for the shop owner. No payment. Rules: 1 per 2 min, 50 per account.
  async placeOrder({ name, city, intent, items, total }) {
    let u = A.user;
    if (!u) u = (await A.signIn()).user;
    const meta = await getDoc(ref('orderMeta', u.uid));
    const count = (meta.exists() ? meta.data().count : 0) + 1;
    if (count > 50) throw Object.assign(new Error('limit'), { code: 'limit' });
    if (meta.exists() && Date.now() - meta.data().last.toMillis() < 120e3) throw Object.assign(new Error('wait'), { code: 'wait' });
    const id = `${u.uid}_${count}`;
    const batch = writeBatch(db);
    batch.set(ref('orderMeta', u.uid), { count, last: serverTimestamp() });
    batch.set(ref('orders', id), {
      uid: u.uid, email: u.email,
      name: cut(name, 80), city: cut(city, 60), intent: cut(intent, 140),
      items: items.slice(0, 10).map((i) => ({ name: cut(i.name, 80), detail: cut(i.detail, 160), price: Number(i.price) || 0 })),
      total: Number(total) || 0, status: 'new', at: serverTimestamp(),
    });
    await batch.commit();
    return { id: `DW-${count}-${u.uid.slice(0, 4).toUpperCase()}`, email: u.email };
  },
};
