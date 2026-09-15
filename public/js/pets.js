export const PETS = [
  { id:'dog', name:'Golden Retriever', sound:'WOOF!', action:'tail wag' },
  { id:'cat', name:'Cat', sound:'MEOW!', action:'stretch' },
  { id:'rabbit', name:'Rabbit', sound:'SNIFF!', action:'hop' },
  { id:'fox', name:'Fox', sound:'YIP!', action:'peek' },
  { id:'panda', name:'Panda', sound:'MMPH!', action:'roll' },
  { id:'koala', name:'Koala', sound:'YAWN!', action:'hug' },
  { id:'frog', name:'Frog', sound:'RIBBIT!', action:'jump' },
  { id:'bear', name:'Bear', sound:'GRR!', action:'wave' },
  { id:'penguin', name:'Penguin', sound:'SQUAWK!', action:'waddle' },
  { id:'hamster', name:'Hamster', sound:'SQUEAK!', action:'zoom' },
];
export const PET_MAP = Object.fromEntries(PETS.map(p => [p.id,p]));
