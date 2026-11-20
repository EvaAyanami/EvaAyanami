// Applique le thème avant le premier rendu pour éviter un flash clair/sombre.
// (Fichier externe : la politique de sécurité du contenu interdit les scripts en ligne.)
try {
  var t = localStorage.getItem('cm-theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {}
