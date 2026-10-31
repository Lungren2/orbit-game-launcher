import { createRoot } from 'react-dom/client';
import { OrbitRoot } from './app';
import './design-system.css';
import './style.css';
import { fontWeights } from './lib/font-weight';

document.documentElement.classList.add('dark');
document.documentElement.classList.toggle('desktop',Boolean(window.orbit));
for (const [name,value] of Object.entries({normal:fontWeights.normal,heading:fontWeights.semibold,display:fontWeights.bold})) document.documentElement.style.setProperty(`--weight-${name}`,value);
createRoot(document.getElementById('app')).render(<OrbitRoot/>);
