/*
 * The whole HUD cascade in one place, imported first by `main.ts` (D-148): base styles, the boot screen, every module's
 * stylesheet, then the instrument theme (it restyles them all from one place) and the phone layout last.
 */
import './styles.css';
import './boot.css';
import './moduleStyles';
import './theme.css';
import './mobile.css';
