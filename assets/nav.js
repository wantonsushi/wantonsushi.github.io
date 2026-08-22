/* Shared page chrome: <site-nav> renders the top bar and the theme toggle.
 *
 *   home     - path back to the site root ("" on the index, "../../" in projects/)
 *   name-id  - optional id for the name link
 */
class SiteNav extends HTMLElement {
    connectedCallback() {
        const home = this.getAttribute('home') ?? '';
        const id = this.getAttribute('name-id');
        const idAttr = id ? ` id="${id}"` : '';

        this.innerHTML = `
<nav class="nav">
    <div class="nav-inner">
        <a href="${home}#top"${idAttr} class="nav-name">Euan Hughes</a>
        <div class="nav-links">
            <a href="${home}#about">About</a>
            <a href="${home}#publications">Publications</a>
            <a href="${home}#projects">Projects</a>
            <a href="${home}assets/my_CV.pdf" target="_blank" rel="noopener noreferrer">CV</a>
            <button class="theme-toggle" type="button" aria-label="Toggle light/dark theme" title="Toggle light/dark theme">
                <i class="fa-solid fa-sun tt-light" aria-hidden="true"></i><i class="fa-solid fa-moon tt-dark" aria-hidden="true"></i>
            </button>
        </div>
    </div>
</nav>`;

        this.querySelector('.theme-toggle').addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem('theme', next); } catch (e) {}
        });
    }
}
customElements.define('site-nav', SiteNav);
