export const SCENES = [
  {
    id: 'cornell-spheres',
    name: 'Cornell Box',
    file: 'scenes/cornell-spheres.json',
    thumb: 'scenes/thumbs/cornell-spheres.webp',
    tier: 'headline',
  },
  {
    id: 'veach-mis',
    name: 'Veach, MIS',
    file: 'scenes/veach-mis.json',
    thumb: 'scenes/thumbs/veach-mis.webp',
    tier: 'headline',
  },
  {
    id: 'veach-bidir',
    name: 'Veach, Bidir Room',
    file: 'scenes/veach-bidir.json',
    thumb: 'scenes/thumbs/veach-bidir.webp',
    tier: 'experimental',
  },
  {
    id: 'veach-ajar',
    name: 'Veach, Ajar (door)',
    file: 'scenes/veach-ajar.json.gz',
    gzip: true,
    thumb: 'scenes/thumbs/veach-ajar.webp',
    tier: 'experimental',
  },
];

export const getScene = (id) => SCENES.find((s) => s.id === id);
