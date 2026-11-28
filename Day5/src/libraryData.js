export const initialBooks = [
  {
    id: "dune",
    title: "Dune",
    author: "Frank Herbert",
    availableCopies: 2,
    holdCount: 0,
    dueDate: null,
    userHasHold: false,
  },
  {
    id: "kindred",
    title: "Kindred",
    author: "Octavia E. Butler",
    availableCopies: 0,
    holdCount: 3,
    dueDate: "2026-11-20",
    userHasHold: false,
  },
  {
    id: "braiding-sweetgrass",
    title: "Braiding Sweetgrass",
    author: "Robin Wall Kimmerer",
    availableCopies: 0,
    holdCount: 1,
    dueDate: "2026-12-03",
    userHasHold: true,
  },
];

export function loadBooks() {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(initialBooks), 250);
  });
}
