// KIKI V12 asset registry. World characters, pets and furniture are real SVG files.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avatarPose = (action='idle') => ({
  'lay-couch':'lie','lay-sleepingbag':'sleep','lay-floor':'lie','lay-next':'lie','sit-together':'sit',
  'high-five':'high-five','fist-bump':'wave','handshake':'wave','dance-together':'dance','wake':'wake'
}[action] || action || 'idle');
const petPose = (action='idle') => ({'owner':'owner','follow':'follow','come':'come','stay':'stay','feed':'eat','hug':'happy','cuddle':'happy','dance':'happy','rest':'lie','stop':'idle','wait':'stay'}[action] || action || 'idle');
const AVATAR_PATH = id => `/assets/characters/${String(id).startsWith('girl')?'girls':'boys'}/${encodeURIComponent(id)}`;
const PET_PATH = id => `/assets/pets/${encodeURIComponent(id)}`;
const APOSE = new Set(['idle','walk','run','wave','high-five','sit','lie','sleep','dance','eat','drink','phone','play','stretch','cheer','clap','laugh','cry','think','surprised','angry','wake','stand','greet']);
const PPOSE = new Set(['idle','walk','run','sit','lie','sleep','wake','follow','come','stay','play','fetch','eat','drink','happy','sad','curious','scratch','groom','owner','avoid']);
export function avatarAsset(id, action='idle') {
  const pose = avatarPose(action); const safePose = APOSE.has(pose) ? pose : 'idle';
  return `<img class="kiki-art avatar-art-file" src="${AVATAR_PATH(id)}_${safePose}.svg" alt="" draggable="false" loading="eager" />`;
}
export function petAsset(type, action='idle') {
  const pose = petPose(action); const safePose = PPOSE.has(pose) ? pose : 'idle';
  return `<img class="kiki-art pet-art-file" src="${PET_PATH(type)}_${safePose}.svg" alt="" draggable="false" loading="lazy" />`;
}
const WORLD = {
  couch:'/assets/world/furniture/couch.svg', chair:'/assets/world/furniture/chair.svg', bed:'/assets/world/furniture/bed.svg',
  'sleeping-bag':'/assets/world/furniture/sleeping-bag.svg', table:'/assets/world/furniture/table.svg', tv:'/assets/world/furniture/tv.svg',
  'pet-bed':'/assets/world/furniture/pet-bed.svg', console:'/assets/world/props/game-console.svg', controller:'/assets/world/props/controller.svg',
  plant:'/assets/world/props/plant.svg', lamp:'/assets/world/props/lamp.svg', rug:'/assets/world/props/rug.svg', pizza:'/assets/world/food/pizza.svg', drink:'/assets/world/food/drink.svg',
  books:'/assets/world/props/books.svg', guitar:'/assets/world/props/guitar.svg'
};
export function furnitureAsset(kind) {
  const src = WORLD[kind] || WORLD.table;
  return `<img class="kiki-prop-art" src="${src}" alt="${esc(kind)}" draggable="false" loading="eager" />`;
}
