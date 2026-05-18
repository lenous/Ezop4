/**
 * Workspace redesign — přejmenovat "Můj prostor" → "Moje práce"
 * a zlepšit vizuální layout stránky.
 *
 * Patch renderWorkspace: lepší header, karty pro každou sekci,
 * kompaktnější tab bar, clear CTA tlačítka.
 */

const W = window as any;

function patchWorkspaceLabel() {
  if (W.__uxPatchedWorkspaceLabel) return;
  if (typeof W.renderWorkspace !== 'function') return;

  const original = W.renderWorkspace;
  W.renderWorkspace = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(() => {
      const page = document.getElementById('page-workspace');
      if (!page) return;

      // Přejmenovat nadpis
      page.querySelectorAll<HTMLElement>('*').forEach(el => {
        if (el.children.length === 0 && el.textContent?.includes('Můj prostor')) {
          el.textContent = el.textContent.replace('Můj prostor', 'Moje práce');
        }
      });

      // Vylepšit header sekci
      const head = page.querySelector<HTMLElement>('[style*="font-size:16px"]');
      if (head && head.parentElement && !head.parentElement.classList.contains('ux-ws-head')) {
        head.parentElement.classList.add('ux-ws-head');
        // Aktualizovat ikonu pokud je tam stará
        if (head.textContent?.includes('📒')) {
          head.textContent = head.textContent.replace('📒 Můj prostor', '🗂 Moje práce')
            .replace('📒', '🗂');
        }
      }

      // Zlepšit tab bary — přidat třídu pro stylování
      page.querySelectorAll<HTMLElement>('[style*="display:flex"][style*="gap:6px"]').forEach(bar => {
        if (!bar.classList.contains('ux-ws-tabs')) {
          bar.classList.add('ux-ws-tabs');
        }
      });

      // Export btn styl
      page.querySelectorAll<HTMLButtonElement>('.btn-ghost').forEach(btn => {
        if (btn.textContent?.includes('Export')) {
          btn.classList.add('ux-ws-export');
        }
      });
    }, 10);
    return result;
  };
  W.__uxPatchedWorkspaceLabel = true;
}

function patchNavWorkspaceLabel() {
  if (W.__uxPatchedNavWs) return;
  if (typeof W.buildNav !== 'function') return;

  const original = W.buildNav;
  W.buildNav = function (...args: any[]) {
    const result = original.apply(this, args);
    // Přejmenovat záložku v navigaci
    document.querySelectorAll<HTMLElement>('.navtab, .bottom-nav-btn').forEach(el => {
      if (el.textContent?.includes('Můj prostor')) {
        el.innerHTML = el.innerHTML.replace('Můj prostor', 'Moje práce');
      }
    });
    return result;
  };
  W.__uxPatchedNavWs = true;
}

function patchGetNavItemsWorkspace() {
  if (W.__uxPatchedNavItemsWs) return;
  if (typeof W.getNavItems !== 'function') return;

  const original = W.getNavItems;
  W.getNavItems = function (...args: any[]) {
    const items = original.apply(this, args);
    if (!Array.isArray(items)) return items;
    return items.map((item: any) => {
      if (item && item.id === 'workspace') {
        return { ...item, label: 'Moje práce', icon: '🗂' };
      }
      return item;
    });
  };
  W.__uxPatchedNavItemsWs = true;
}

export function installWorkspaceFix() {
  patchWorkspaceLabel();
  patchNavWorkspaceLabel();
  patchGetNavItemsWorkspace();
}
