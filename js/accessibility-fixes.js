/**
 * Accessibility Fixes - Infrabel Websites
 *
 * Supports: opendata.infrabel.be, keyfigures.infrabel.be
 *
 * Auto-detects the current site and applies all relevant fixes.
 * Both sites use the same ODS widgets framework.
 */

(function() {
    'use strict';

    const utils = {
        ready: function(callback) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', callback);
            } else {
                callback();
            }
        },

        selectAll: function(selector, context = document) {
            return Array.from(context.querySelectorAll(selector));
        },

        select: function(selector, context = document) {
            return context.querySelector(selector);
        }
    };

    // Centralized API response interception (patched once, shared by all fixes)
    const apiInterceptors = [];
    function onApiResponse(urlTest, callback) {
        apiInterceptors.push({ urlTest: urlTest, callback: callback });
    }

    (function patchNetworkApis() {
        var originalFetch = window.fetch;
        window.fetch = function() {
            var args = arguments;
            var url = args[0];
            var urlString = typeof url === 'string' ? url : url.url;

            return originalFetch.apply(this, args).then(function(response) {
                apiInterceptors.forEach(function(entry) {
                    if (urlString && entry.urlTest(urlString)) {
                        response.clone().json().then(entry.callback).catch(function() {});
                    }
                });
                return response;
            });
        };

        var originalXHROpen = XMLHttpRequest.prototype.open;
        var originalXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._a11yUrl = url;
            return originalXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function() {
            var self = this;
            var url = self._a11yUrl;
            if (url) {
                self.addEventListener('load', function() {
                    try {
                        var data = JSON.parse(self.responseText);
                        apiInterceptors.forEach(function(entry) {
                            if (entry.urlTest(url)) entry.callback(data);
                        });
                    } catch (e) {}
                });
            }
            return originalXHRSend.apply(this, arguments);
        };
    })();

    // =========================================================================
    // ACCESSIBILITY FIXES
    // =========================================================================

    const fixes = {
        /**
         * Fix: Add missing alt attributes to images
         *
         * Issue: Images without alt attribute are not accessible to screen readers
         *
         * Solution: Add empty alt="" to mark them as decorative
         */
        fixMissingAltAttributes: function() {
            function applyFix(img) {
                if (!img.hasAttribute('alt')) {
                    img.setAttribute('alt', '');
                }
            }

            utils.selectAll('img:not([alt])').forEach(applyFix);

            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.tagName === 'IMG') applyFix(node);
                            if (node.querySelectorAll) {
                                node.querySelectorAll('img:not([alt])').forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        },

        /**
         * Facet filter reading order
         *
         * Issue: Screen readers announce "62017" instead of "2017 6"
         * because DOM order has count before name, but CSS visually
         * reverses them.
         *
         * Solution: Swap DOM order so name comes before count,
         * matching the visual reading order.
         */
        fixFacetReadingOrder: function() {
            function fixCategory(category) {
                // Skip if already fixed
                if (category.dataset.a11yFixed) return;

                const count = category.querySelector('.odswidget-facet__category-count');
                const name = category.querySelector('.odswidget-facet__category-name');

                // Only fix if both elements exist and count is before name in DOM
                if (count && name && count.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    // Move name before count to match visual order
                    count.parentNode.insertBefore(name, count);
                    // Add visually hidden space for screen readers
                    const space = document.createElement('span');
                    space.textContent = '\u00A0';
                    space.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;';
                    count.parentNode.insertBefore(space, count);
                    category.dataset.a11yFixed = 'true';
                }
            }

            // Fix existing elements
            utils.selectAll('.odswidget-facet__category').forEach(fixCategory);

            // Watch for dynamically added facets (Angular)
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if the added node is a facet category
                            if (node.matches && node.matches('.odswidget-facet__category')) {
                                fixCategory(node);
                            }
                            // Check for facet categories within added nodes
                            if (node.querySelectorAll) {
                                node.querySelectorAll('.odswidget-facet__category').forEach(fixCategory);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

        },

        /**
         * Heading hierarchy - multiple h1 elements
         *
         * Issue: Secondary sections like "Filters" use h1, breaking
         * the semantic heading structure. There should only be one h1
         * per page (the main page title).
         *
         * Solution: Convert inappropriate h1 elements to h2.
         */
        fixHeadingHierarchy: function() {
            // Selectors for h1 elements that should be h2
            const incorrectH1Selectors = [
                'h1.ods-filters__filters',
                'h1.ods-filters__filters-summary',
                'h1.ods-filters__export-catalog-title'
            ];

            function replaceH1WithH2(h1) {
                const h2 = document.createElement('h2');
                // Copy all attributes
                Array.from(h1.attributes).forEach(attr => {
                    h2.setAttribute(attr.name, attr.value);
                });
                // Move content
                while (h1.firstChild) h2.appendChild(h1.firstChild);
                h1.parentNode.replaceChild(h2, h1);
            }

            function fixHeadings() {
                incorrectH1Selectors.forEach(selector => {
                    utils.selectAll(selector).forEach(replaceH1WithH2);
                });
            }

            // Fix existing elements
            fixHeadings();

            // Watch for dynamically added headings (Angular)
            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            incorrectH1Selectors.forEach(selector => {
                                if ((node.matches && node.matches(selector)) ||
                                    (node.querySelector && node.querySelector(selector))) {
                                    needsFix = true;
                                }
                            });
                        }
                    });
                });
                if (needsFix) fixHeadings();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

        },

        /**
         * Menu items missing aria-expanded state
         *
         * Issue: Navigation menu items that open sub-menus (e.g., "FR", "Outils",
         * "Dashboards", "Info") do not expose their expanded/collapsed state to
         * assistive technologies. Screen reader users cannot know if a sub-menu
         * is open or closed.
         *
         * Solution: Add aria-expanded attribute to menu items that control sub-menus
         * and toggle the value dynamically when the state changes.
         */
        fixMenuAriaExpanded: function() {
            function applyFix(menuItem) {
                // Find the link element within the menu item
                const link = menuItem.querySelector('.ods-front-header__menu-item-link');
                if (!link) return;

                // Check if this menu item has a sub-menu (dropdown-menu-submenu)
                const subMenu = menuItem.querySelector('.dropdown-menu-submenu');
                if (!subMenu) return; // Not a menu with sub-menu, skip

                // Skip if already fixed
                if (link.dataset.a11yExpandedFixed) return;

                // Function to check if menu is expanded
                function isMenuExpanded() {
                    return link.classList.contains('ods-front-header__menu-item-link--active');
                }

                // Set initial state
                link.setAttribute('aria-expanded', isMenuExpanded() ? 'true' : 'false');
                link.dataset.a11yExpandedFixed = 'true';

                // Watch for class changes on the link element to update aria-expanded
                const classObserver = new MutationObserver(mutations => {
                    mutations.forEach(mutation => {
                        if (mutation.attributeName === 'class') {
                            link.setAttribute('aria-expanded', isMenuExpanded() ? 'true' : 'false');
                        }
                    });
                });

                classObserver.observe(link, { attributes: true, attributeFilter: ['class'] });

            }

            // Fix existing menu items
            utils.selectAll('.ods-front-header__menu-item').forEach(applyFix);

            // Watch for dynamically added menu items
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches('.ods-front-header__menu-item')) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll('.ods-front-header__menu-item').forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Navigation structure - nav element wraps entire header
         *
         * Issue: The <nav> element wraps the entire header content including
         * the logo, hamburger button, and other non-navigation elements.
         * This creates an overly large navigation landmark that doesn't
         * accurately represent the actual navigation.
         *
         * Solution: Replace the outer nav with a div and wrap only the main
         * menu list in a proper <nav> element.
         */
        fixNavStructure: function() {
            function applyFix() {
                // Find the outer nav that wraps everything
                const outerNav = utils.select('nav.ods-front-header');
                if (!outerNav) return;

                // Find the main menu list
                const mainMenu = utils.select('ul.ods-front-header__menu', outerNav);
                if (!mainMenu) return;

                // Replace the nav with a div
                const newDiv = document.createElement('div');

                // Copy all attributes from nav to div
                Array.from(outerNav.attributes).forEach(attr => {
                    newDiv.setAttribute(attr.name, attr.value);
                });

                // Move all children to the new div
                while (outerNav.firstChild) {
                    newDiv.appendChild(outerNav.firstChild);
                }

                // Replace nav with div in the DOM
                outerNav.parentNode.replaceChild(newDiv, outerNav);

                // Now find the main menu in the new structure and wrap it in nav
                const menuInNewDiv = utils.select('ul.ods-front-header__menu', newDiv);
                if (menuInNewDiv && !menuInNewDiv.dataset.a11yNavFixed) {
                    const newNav = document.createElement('nav');
                    newNav.setAttribute('aria-label', 'Main navigation');

                    menuInNewDiv.parentNode.insertBefore(newNav, menuInNewDiv);
                    newNav.appendChild(menuInNewDiv);
                    menuInNewDiv.dataset.a11yNavFixed = 'true';
                }

            }

            // Try to apply fix immediately
            applyFix();

            // Watch for dynamically added content (Angular)
            const observer = new MutationObserver(mutations => {
                // Only run if we still have a nav.ods-front-header (Angular re-rendered)
                if (utils.select('nav.ods-front-header')) {
                    applyFix();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Search input missing label, submit button, and keyboard navigation
         *
         * Issue: The search input in the header has only a placeholder,
         * no proper label, no submit button, and no search landmark.
         * Screen reader users don't know:
         * - What the input is for (placeholder is not a label)
         * - That search happens automatically while typing
         * - How to explicitly submit a search
         * - They can't navigate results with arrow keys (natural expectation)
         *
         * Solution: Implement ARIA combobox pattern with:
         * - role="search" on container
         * - role="combobox" on input with aria-expanded, aria-controls
         * - role="listbox" on results with role="option" on each result
         * - Arrow key navigation through results
         * - Enter to follow selected result, Escape to close
         */
        fixSearchInputAccessibility: function() {
            function applyFix(searchModule) {
                if (searchModule.dataset.a11ySearchFixed) return;

                const inputHolder = utils.select('.input-holder', searchModule);
                const input = utils.select('input[type="text"]', inputHolder);
                if (!input) return;

                // Add search landmark role to the container
                searchModule.setAttribute('role', 'search');

                // Generate unique ID for the input if it doesn't have one
                if (!input.id) {
                    input.id = 'a11y-search-input-' + Math.random().toString(36).substr(2, 9);
                }

                // Add a visually hidden label
                const label = document.createElement('label');
                label.setAttribute('for', input.id);
                label.textContent = 'Search datasets';
                label.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;';
                inputHolder.insertBefore(label, input);

                // Find the search icon container and convert it to a submit button
                const iconContainer = utils.select('.zoom-before-input', inputHolder);
                if (iconContainer) {
                    // Create a button to replace the div
                    const submitButton = document.createElement('button');
                    submitButton.type = 'button'; // Not a real form submit
                    submitButton.className = iconContainer.className;
                    while (iconContainer.firstChild) submitButton.appendChild(iconContainer.firstChild);
                    submitButton.setAttribute('aria-label', 'Search');

                    // Reset button styling to look like the original div
                    submitButton.style.cssText = 'background:none;border:none;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;';

                    // When clicked, trigger the search by focusing and blurring the input
                    submitButton.addEventListener('click', function() {
                        input.focus();
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    });

                    iconContainer.parentNode.replaceChild(submitButton, iconContainer);
                }

                // Set up combobox pattern
                const resultsContainerId = input.id + '-results';
                input.setAttribute('role', 'combobox');
                input.setAttribute('aria-autocomplete', 'list');
                input.setAttribute('aria-expanded', 'false');
                input.setAttribute('aria-controls', resultsContainerId);
                input.setAttribute('aria-haspopup', 'listbox');

                // Track current selection
                let currentIndex = -1;

                // Function to get results container and items
                function getResultsContainer() {
                    return utils.select('.display-results', searchModule);
                }

                function getResultItems() {
                    const container = getResultsContainer();
                    if (!container) return [];
                    return utils.selectAll('.result', container);
                }

                // Function to update visual and ARIA selection
                function updateSelection(newIndex) {
                    const items = getResultItems();
                    if (items.length === 0) return;

                    // Remove previous selection
                    items.forEach((item, i) => {
                        item.classList.remove('a11y-selected');
                        const link = utils.select('a', item);
                        if (link) {
                            link.setAttribute('aria-selected', 'false');
                        }
                    });

                    // Apply new selection
                    if (newIndex >= 0 && newIndex < items.length) {
                        currentIndex = newIndex;
                        const selectedItem = items[currentIndex];
                        selectedItem.classList.add('a11y-selected');

                        const link = utils.select('a', selectedItem);
                        if (link) {
                            link.setAttribute('aria-selected', 'true');
                            if (!link.id) {
                                link.id = input.id + '-option-' + currentIndex;
                            }
                            input.setAttribute('aria-activedescendant', link.id);

                            // Scroll into view if needed
                            selectedItem.scrollIntoView({ block: 'nearest' });
                        }
                    } else {
                        currentIndex = -1;
                        input.removeAttribute('aria-activedescendant');
                    }
                }

                // Keyboard navigation
                input.addEventListener('keydown', function(e) {
                    const items = getResultItems();
                    const isExpanded = input.getAttribute('aria-expanded') === 'true';

                    if (!isExpanded || items.length === 0) {
                        // If results aren't showing, let arrow keys work normally
                        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                    }

                    switch (e.key) {
                        case 'ArrowDown':
                            e.preventDefault();
                            if (currentIndex < items.length - 1) {
                                updateSelection(currentIndex + 1);
                            } else {
                                updateSelection(0); // Wrap to first
                            }
                            break;

                        case 'ArrowUp':
                            e.preventDefault();
                            if (currentIndex > 0) {
                                updateSelection(currentIndex - 1);
                            } else {
                                updateSelection(items.length - 1); // Wrap to last
                            }
                            break;

                        case 'Enter':
                            if (currentIndex >= 0 && currentIndex < items.length) {
                                e.preventDefault();
                                const link = utils.select('a', items[currentIndex]);
                                if (link) {
                                    link.click();
                                }
                            }
                            break;

                        case 'Escape':
                            e.preventDefault();
                            currentIndex = -1;
                            input.removeAttribute('aria-activedescendant');
                            // Trigger clear by clicking the clear button if it exists
                            const clearBtn = utils.select('.clear-button', searchModule);
                            if (clearBtn) {
                                clearBtn.click();
                            }
                            break;
                    }
                });

                // Watch for results container to appear/change
                function setupResultsListbox() {
                    const resultsHolder = utils.select('.display-results-holder', searchModule);
                    const resultsContainer = getResultsContainer();

                    // Fix the close button - replace div with proper button
                    // This runs every time since the element is recreated when results appear
                    if (resultsHolder) {
                        const closeDiv = utils.select('div.display-results__clear-button', resultsHolder);
                        if (closeDiv) {
                            // Detect language for accessible name (NL/FR site)
                            const lang = (document.documentElement.lang || 'nl').toLowerCase().split('-')[0];
                            const closeLabel = lang === 'fr' ? 'Fermer les résultats' : 'Zoekresultaten sluiten';

                            // Create button to replace the div
                            const closeButton = document.createElement('button');
                            closeButton.type = 'button';
                            closeButton.className = closeDiv.className;
                            while (closeDiv.firstChild) closeButton.appendChild(closeDiv.firstChild);
                            closeButton.setAttribute('aria-label', closeLabel);

                            // Reset button styling
                            closeButton.style.cssText = 'background:none;border:none;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;';

                            // Replicate ng-click="search.display = false" via Angular scope
                            closeButton.addEventListener('click', function() {
                                if (typeof angular !== 'undefined') {
                                    try {
                                        const scope = angular.element(searchModule).scope();
                                        if (scope) {
                                            scope.$apply(function() {
                                                scope.search.display = false;
                                            });
                                        }
                                    } catch (e) {}
                                }
                            });

                            closeDiv.parentNode.replaceChild(closeButton, closeDiv);
                        }
                    }

                    if (resultsContainer && !resultsContainer.dataset.a11yListboxSetup) {
                        // Set up the listbox
                        resultsContainer.id = resultsContainerId;
                        resultsContainer.setAttribute('role', 'listbox');
                        resultsContainer.setAttribute('aria-label', 'Search results');

                        // Set up each result as an option
                        getResultItems().forEach((item, index) => {
                            const link = utils.select('a', item);
                            if (link) {
                                link.setAttribute('role', 'option');
                                link.setAttribute('aria-selected', 'false');
                                link.setAttribute('tabindex', '-1'); // Navigate via arrow keys only
                                if (!link.id) {
                                    link.id = input.id + '-option-' + index;
                                }
                            }
                        });

                        resultsContainer.dataset.a11yListboxSetup = 'true';
                        input.setAttribute('aria-expanded', 'true');
                        currentIndex = -1;

                    } else if (!resultsHolder) {
                        // Results closed
                        input.setAttribute('aria-expanded', 'false');
                        input.removeAttribute('aria-activedescendant');
                        currentIndex = -1;
                    }
                }

                // Observe for results appearing
                const resultsObserver = new MutationObserver(function() {
                    setupResultsListbox();

                    // Also watch for new results being added (infinite scroll)
                    const resultsContainer = getResultsContainer();
                    if (resultsContainer) {
                        getResultItems().forEach((item, index) => {
                            const link = utils.select('a', item);
                            if (link && !link.hasAttribute('role')) {
                                link.setAttribute('role', 'option');
                                link.setAttribute('aria-selected', 'false');
                                link.setAttribute('tabindex', '-1'); // Navigate via arrow keys only
                                if (!link.id) {
                                    link.id = input.id + '-option-' + index;
                                }
                            }
                        });
                    }
                });

                resultsObserver.observe(searchModule, { childList: true, subtree: true });

                // Add CSS for selection highlighting
                if (!document.getElementById('a11y-search-selection-styles')) {
                    const style = document.createElement('style');
                    style.id = 'a11y-search-selection-styles';
                    style.textContent = `
                        .result.a11y-selected {
                            outline: 2px solid #005fcc;
                            outline-offset: -2px;
                            background-color: rgba(0, 95, 204, 0.1);
                        }
                        .result.a11y-selected a {
                            background-color: rgba(0, 95, 204, 0.1);
                        }
                    `;
                    document.head.appendChild(style);
                }

                searchModule.dataset.a11ySearchFixed = 'true';
            }

            // Fix existing search modules
            utils.selectAll('.search-module').forEach(applyFix);

            // Watch for dynamically added search modules
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches('.search-module')) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll('.search-module').forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Search results live announcements
         *
         * Issue: Search results update dynamically while typing, but
         * screen reader users receive no feedback about the changes.
         *
         * Solution: Add an aria-live region that announces result counts.
         */
        fixSearchResultsAnnouncements: function() {
            // Create visually hidden live region
            const liveRegion = document.createElement('div');
            liveRegion.id = 'a11y-search-status';
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.setAttribute('role', 'status');
            liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;';
            document.body.appendChild(liveRegion);

            let lastResultCount = -1;
            let announceTimeout = null;

            function announceResults() {
                const resultsContainer = utils.select('.display-results-holder');

                if (!resultsContainer) {
                    // Search closed
                    if (lastResultCount !== -1) {
                        lastResultCount = -1;
                    }
                    return;
                }

                const results = utils.selectAll('.result[ng-repeat="item in results"]', resultsContainer);
                const noResultsEl = utils.select('.odswidget-infinite-scroll-results__no-more-results-message', resultsContainer);
                const isLoading = utils.select('[infinite-scroll-disabled="fetching"]', resultsContainer);

                const resultCount = results.length;

                // Only announce if count changed
                if (resultCount === lastResultCount) return;
                lastResultCount = resultCount;

                // Debounce announcements
                if (announceTimeout) clearTimeout(announceTimeout);
                announceTimeout = setTimeout(() => {
                    let message = '';
                    if (resultCount === 0) {
                        message = 'Geen resultaten gevonden';
                    } else if (resultCount === 1) {
                        message = '1 resultaat gevonden';
                    } else {
                        message = resultCount + ' resultaten gevonden';
                    }

                    liveRegion.textContent = message;
                }, 500); // Wait 500ms for typing to settle
            }

            // Watch for search results changes
            const observer = new MutationObserver(mutations => {
                announceResults();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

        },

        /**
         * Active filters lack clear remove affordance
         *
         * Issue: Under "Filtres actifs", clicking an active filter immediately removes it.
         * This is problematic because:
         * - No visible indication that the element is a removal control
         * - The accessible name doesn't communicate the destructive action
         * - Users assume they're interacting with a label, not a remove button
         *
         * Solution: Transform active filter chips to have:
         * - The filter label as informational text (not clickable)
         * - A separate, clearly identifiable remove button (×) with proper aria-label
         */
        fixActiveFilterRemoveButton: function() {
            function applyFix(filterLink) {
                // Skip if already fixed
                if (filterLink.dataset.a11yFilterFixed) return;

                // Get the parent list item
                const listItem = filterLink.closest('.odswidget-filter-summary__active-filter');
                if (!listItem) return;

                // Get the filter label and value
                const labelEl = filterLink.querySelector('.odswidget-filter-summary__active-filter-label');
                const valueEl = filterLink.querySelector('.odswidget-filter-summary__active-filter-value');

                if (!labelEl || !valueEl) return;

                const filterLabel = labelEl.textContent.trim();
                const filterValue = valueEl.textContent.trim();
                const fullFilterName = filterLabel + ': ' + filterValue;

                // Create the new chip structure
                const chip = document.createElement('span');
                chip.className = 'a11y-filter-chip';
                chip.style.cssText = 'display:inline-flex;align-items:center;gap:0.25em;';

                // Create the label span (non-interactive) - preserving original structure
                const labelSpan = document.createElement('span');
                labelSpan.className = 'a11y-filter-label';
                const labelInner = document.createElement('span');
                labelInner.className = 'odswidget-filter-summary__active-filter-label';
                labelInner.textContent = filterLabel;
                const valueInner = document.createElement('span');
                valueInner.className = 'odswidget-filter-summary__active-filter-value';
                valueInner.textContent = filterValue;
                labelSpan.appendChild(labelInner);
                labelSpan.append(' ', valueInner);

                // Create the remove button
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'a11y-filter-remove';
                removeBtn.setAttribute('aria-label', 'Remove filter: ' + fullFilterName);
                removeBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0.125em 0.25em;font-size:inherit;color:inherit;line-height:1;border-radius:2px;margin-left:0.25em;';
                const removeBtnIcon = document.createElement('span');
                removeBtnIcon.setAttribute('aria-hidden', 'true');
                removeBtnIcon.textContent = '\u00d7';
                removeBtn.appendChild(removeBtnIcon);

                // Add hover/focus styles
                removeBtn.addEventListener('mouseenter', function() {
                    this.style.backgroundColor = 'rgba(0,0,0,0.1)';
                });
                removeBtn.addEventListener('mouseleave', function() {
                    this.style.backgroundColor = 'transparent';
                });
                removeBtn.addEventListener('focus', function() {
                    this.style.outline = '2px solid currentColor';
                    this.style.outlineOffset = '1px';
                });
                removeBtn.addEventListener('blur', function() {
                    this.style.outline = 'none';
                });

                // Transfer the click action to the remove button
                removeBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Trigger click on the original link to remove the filter
                    filterLink.click();
                });

                // Assemble the chip
                chip.appendChild(labelSpan);
                chip.appendChild(removeBtn);

                // Hide the original link content visually but keep it for Angular
                filterLink.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;pointer-events:none;';
                filterLink.setAttribute('tabindex', '-1');
                filterLink.setAttribute('aria-hidden', 'true');

                // Insert the chip after the hidden link
                filterLink.parentNode.insertBefore(chip, filterLink.nextSibling);

                filterLink.dataset.a11yFilterFixed = 'true';
            }

            // Selector for active filter links in the filter summary
            const selector = 'a.odswidget-filter-summary__active-filter-link';

            // Fix existing elements
            utils.selectAll(selector).forEach(applyFix);

            // Watch for dynamically added active filters (Angular)
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if it's an active filter list item
                            if (node.matches && node.matches('.odswidget-filter-summary__active-filter')) {
                                const link = node.querySelector(selector);
                                if (link) applyFix(link);
                            }
                            // Check if it's the link itself
                            if (node.matches && node.matches(selector)) {
                                applyFix(node);
                            }
                            // Check within added nodes
                            if (node.querySelectorAll) {
                                node.querySelectorAll(selector).forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

        },

        /**
         * Collapsible panels have mismatched aria-label and visible text
         *
         * Issue: Collapsible toggle buttons show "Klik om uit te vouwen" but have
         * aria-label="Druk enter om panel te vergroten". This creates a mismatch
         * between what sighted users see and what screen reader users hear.
         * Voice control users cannot activate the control using the visible label.
         *
         * Solution: Remove the aria-label attributes so the accessible name
         * matches the visible text content.
         */
        fixCollapsibleAriaLabel: function() {
            function applyFix(element) {
                if (element.dataset.a11yCollapsibleFixed) return;

                // Remove the mismatched aria-label
                if (element.hasAttribute('aria-label')) {
                    element.removeAttribute('aria-label');
                    element.dataset.a11yCollapsibleFixed = 'true';
                }
            }

            // Selector for collapsible toggle buttons
            const selector = '.ods-collapsible__help-text span[role="button"]';

            // Fix existing elements
            utils.selectAll(selector).forEach(applyFix);

            // Watch for dynamically added collapsibles (Angular)
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selector)) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll(selector).forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * "More sort options" button not keyboard operable + missing accessible name
         *
         * Issue #23: The three-dot button that reveals additional sorting options
         * doesn't work with keyboard. Pressing Enter does nothing, and TAB
         * moves to a hidden select element.
         *
         * Issue #4: The icon-only button has no accessible name - screen readers
         * only announce "button" with no indication of its function.
         *
         * Solution:
         * - Make the button focusable (remove tabindex="-1")
         * - Add aria-label="Meer sorteeropties" for screen readers
         * - When button is activated (Enter/Space/click), open the select dropdown
         * - Add proper ARIA attributes (aria-haspopup)
         */
        fixSortButtonKeyboard: function() {
            function applyFix(container) {
                const button = container.querySelector('.ods-catalog-sort__selector__more-button');
                const select = container.querySelector('.ods-catalog-sort__selector__more-select');

                if (!button || !select) return;
                if (button.dataset.a11ySortFixed) return;

                // Make button focusable
                button.removeAttribute('tabindex');

                // Add ARIA attributes with localized label
                button.setAttribute('aria-haspopup', 'listbox');

                // Get current language from html lang attribute
                const lang = (document.documentElement.lang || 'nl').toLowerCase().split('-')[0];
                const labels = {
                    'nl': 'Meer sorteeropties',
                    'fr': "Plus d'options de tri",
                    'en': 'More sorting options'
                };
                // Match language prefix (e.g., 'nl-NL' -> 'nl')
                const langPrefix = lang.split('-')[0];
                button.setAttribute('aria-label', labels[langPrefix] || labels['nl']);

                // Hide select from tab order since button will control it
                select.setAttribute('tabindex', '-1');

                // When button is clicked or activated with keyboard, open select
                function activateSelect(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Focus the select and simulate a click to open it
                    select.focus();

                    // Try to open the select programmatically
                    // Different browsers handle this differently
                    if (typeof select.showPicker === 'function') {
                        // Modern browsers
                        try {
                            select.showPicker();
                        } catch (err) {
                            // showPicker may fail in some contexts, fall back to focus
                        }
                    } else {
                        // Fallback: simulate mousedown to trigger dropdown
                        const event = new MouseEvent('mousedown', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        select.dispatchEvent(event);
                    }
                }

                button.addEventListener('click', activateSelect);
                button.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        activateSelect(e);
                    }
                });

                // When select value changes, return focus to button
                select.addEventListener('change', function() {
                    button.focus();
                });

                // When select loses focus (closed without selection), return focus to button
                select.addEventListener('blur', function() {
                    // Small delay to allow change event to fire first
                    setTimeout(function() {
                        if (document.activeElement !== select) {
                            // Only refocus button if focus moved elsewhere unexpectedly
                        }
                    }, 10);
                });

                button.dataset.a11ySortFixed = 'true';
            }

            // Selector for the sort selector container
            const containerSelector = '.ods-catalog-sort__selector__opt--select';

            // Fix existing elements
            utils.selectAll(containerSelector).forEach(applyFix);

            // Watch for dynamically added elements
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(containerSelector)) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll(containerSelector).forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix: Sort radio buttons not grouped + select has duplicate options
         *
         * Issue: The three sort radio buttons (Gewijzigd, Populair, A tot Z)
         * each get a unique auto-generated name attribute from Angular,
         * preventing arrow key navigation between them. Additionally, the
         * "more options" select duplicates the values already available as
         * radio buttons.
         *
         * Solution: Give all radio inputs the same name so they form a
         * keyboard-navigable group, and remove select options whose values
         * already appear as radio buttons.
         */
        fixSortRadioGroup: function() {
            const selectorContainer = '.ods-catalog-sort__selector';

            function applyFix(container) {
                if (container.dataset.a11yRadioGroupFixed) return;

                // Collect radio button values and unify their name
                const radios = utils.selectAll('.ods-catalog-sort__selector__opt__input', container);
                if (!radios.length) return;

                const radioValues = new Set();
                radios.forEach(radio => {
                    radio.setAttribute('name', 'catalog-sort');
                    radioValues.add(radio.value);
                });

                // Remove duplicate options from the select
                const select = utils.select('.ods-catalog-sort__selector__more-select', container);
                if (select) {
                    utils.selectAll('option', select).forEach(option => {
                        if (radioValues.has(option.value)) {
                            option.remove();
                        }
                    });
                }

                container.dataset.a11yRadioGroupFixed = 'true';
            }

            // Fix existing elements
            utils.selectAll(selectorContainer).forEach(applyFix);

            // Watch for dynamically added elements
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selectorContainer)) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll(selectorContainer).forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Hidden mobile menu remains focusable
         *
         * Issue: When the mobile menu is visually hidden (hamburger menu closed),
         * the menu links are still reachable via TAB and exposed to assistive
         * technologies. This creates a confusing experience where:
         * - Keyboard users tab through invisible links
         * - Screen reader users perceive the menu as present when it's not visible
         * - Visual state (closed) doesn't match programmatic state (exposed)
         *
         * Solution: When the menu is closed, hide it from keyboard and AT by:
         * - Adding aria-hidden="true" to the menu container
         * - Setting tabindex="-1" on all focusable elements
         * - Adding aria-expanded to the hamburger toggle button
         * When opened, restore accessibility.
         */
        fixMobileMenuFocusability: function() {
            // Selectors based on actual site structure
            const menuContainerSelector = '.ods-responsive-menu-collapsible';
            const expandedClass = 'ods-responsive-menu-collapsible--expanded';
            const hamburgerButtonSelector = '.ods-responsive-menu-placeholder__toggle';
            const closeButtonSelector = '.ods-responsive-menu-collapsible__toggle-button';

            let menuContainer = null;
            let hamburgerButton = null;
            let closeButton = null;

            // Check for expanded class (menu can have both --collapsed and --expanded)
            function isMenuExpanded() {
                if (!menuContainer) return false;
                return menuContainer.classList.contains(expandedClass);
            }

            // Check if we're in mobile view (hamburger button is visible)
            function isMobileView() {
                if (!hamburgerButton) return false;
                // Check if hamburger button is visible (not display:none)
                return hamburgerButton.offsetParent !== null;
            }

            function getAllInteractiveElements(container) {
                // Get all potentially focusable elements (including those we've hidden)
                return utils.selectAll(
                    'a[href], button, input, select, textarea, [tabindex], [data-a11y-original-tabindex]',
                    container
                );
            }

            function hideMenu() {
                if (!menuContainer) return;

                // Hide from assistive technologies
                menuContainer.setAttribute('aria-hidden', 'true');

                // Make all focusable elements not focusable
                getAllInteractiveElements(menuContainer).forEach(el => {
                    // Skip if already hidden by us
                    if (el.dataset.a11yOriginalTabindex !== undefined) return;

                    // Store original tabindex
                    el.dataset.a11yOriginalTabindex = el.hasAttribute('tabindex')
                        ? el.getAttribute('tabindex')
                        : 'none';
                    el.setAttribute('tabindex', '-1');
                });

                // Update hamburger button state
                if (hamburgerButton) {
                    hamburgerButton.setAttribute('aria-expanded', 'false');
                }

            }

            function showMenu() {
                if (!menuContainer) return;

                // Show to assistive technologies
                menuContainer.removeAttribute('aria-hidden');

                // Restore focusability for elements we previously hid
                getAllInteractiveElements(menuContainer).forEach(el => {
                    if (el.dataset.a11yOriginalTabindex !== undefined) {
                        if (el.dataset.a11yOriginalTabindex === 'none') {
                            el.removeAttribute('tabindex');
                        } else {
                            el.setAttribute('tabindex', el.dataset.a11yOriginalTabindex);
                        }
                        delete el.dataset.a11yOriginalTabindex;
                    }
                });

                // Update hamburger button state
                if (hamburgerButton) {
                    hamburgerButton.setAttribute('aria-expanded', 'true');
                }

            }

            function updateMenuState() {
                // Only apply mobile menu hiding when actually in mobile view
                if (!isMobileView()) {
                    // Desktop view - ensure menu is accessible
                    showMenu();
                    return;
                }

                // Mobile view - hide/show based on expanded state
                if (isMenuExpanded()) {
                    showMenu();
                } else {
                    hideMenu();
                }
            }

            function initializeFix() {
                menuContainer = utils.select(menuContainerSelector);

                if (!menuContainer) {
                    return false;
                }

                hamburgerButton = utils.select(hamburgerButtonSelector);
                closeButton = utils.select(closeButtonSelector);

                // Set up ARIA relationship between hamburger and menu
                if (hamburgerButton) {
                    if (!menuContainer.id) {
                        menuContainer.id = 'a11y-mobile-menu';
                    }
                    hamburgerButton.setAttribute('aria-controls', menuContainer.id);
                    hamburgerButton.setAttribute('aria-expanded', isMenuExpanded() ? 'true' : 'false');
                }

                // Set initial state
                updateMenuState();

                // Watch for class changes on menu container (collapsed state)
                const containerObserver = new MutationObserver(mutations => {
                    mutations.forEach(mutation => {
                        if (mutation.attributeName === 'class') {
                            updateMenuState();
                        }
                    });
                });

                containerObserver.observe(menuContainer, {
                    attributes: true,
                    attributeFilter: ['class']
                });

                // Watch for viewport changes (desktop <-> mobile)
                let resizeTimeout;
                window.addEventListener('resize', function() {
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(updateMenuState, 100);
                });

                return true;
            }

            // Try to initialize immediately
            if (!initializeFix()) {
                // Watch for the menu elements to be added (Angular)
                const observer = new MutationObserver(mutations => {
                    if (initializeFix()) {
                        observer.disconnect();
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }

        },

        /**
         * Fix: Focus outline not visible
         *
         * Issue: When tabbing through the website, the focus indicator is not
         * visible, making keyboard navigation impossible for sighted users.
         * The site CSS likely uses `outline: none` without providing an
         * alternative focus style.
         *
         * Solution: Inject CSS that ensures all focusable elements have a
         * visible focus indicator. Uses :focus-visible to only show outlines
         * for keyboard navigation (not mouse clicks).
         */
        fixFocusOutline: function() {
            const style = document.createElement('style');
            style.id = 'a11y-focus-outline-fix';
            style.textContent = `
                /* Ensure focus outline is visible for keyboard users - Issue #26 */
                *:focus-visible {
                    outline: 2px solid #025da4 !important;
                    outline-offset: 1px !important;
                }

                /* Fallback for browsers without :focus-visible support */
                @supports not selector(:focus-visible) {
                    *:focus {
                        outline: 2px solid #025da4 !important;
                        outline-offset: 1px !important;
                    }
                }

                /* High contrast outline for dark backgrounds */
                .ods-front-header *:focus-visible,
                .ods-front-footer *:focus-visible,
                [style*="background"]:not([style*="background: #fff"]):not([style*="background: white"]):not([style*="background:#fff"]) *:focus-visible {
                    outline-color: #ffffff !important;
                    box-shadow: 0 0 0 2px #025da4 !important;
                }

                /* Sort selector: show focus on label when radio input inside is focused */
                /* Using inset box-shadow instead of outline because parent has overflow:hidden */
                .ods-catalog-sort__selector__opt:has(input:focus-visible) {
                    outline: none !important;
                    box-shadow: inset 0 0 0 2px #025da4 !important;
                }

                /* Sort selector: show focus on the "more options" container when select is focused */
                .ods-catalog-sort__selector__opt--select:has(.ods-catalog-sort__selector__more-select:focus),
                .ods-catalog-sort__selector__opt--select:has(.ods-catalog-sort__selector__more-select:focus-visible) {
                    box-shadow: inset 0 0 0 2px #025da4 !important;
                }

                /* Style the three-dot button when focused */
                .ods-catalog-sort__selector__more-button:focus,
                .ods-catalog-sort__selector__more-button:focus-visible {
                    outline: none !important;
                    box-shadow: inset 0 0 0 2px #025da4 !important;
                }

                /* General pattern: labels with hidden inputs should show focus */
                label:has(input[type="radio"]:focus-visible),
                label:has(input[type="checkbox"]:focus-visible) {
                    outline: 2px solid #025da4 !important;
                    outline-offset: 2px !important;
                }

                /* Hide the actual input's outline since we're showing it on the label */
                .ods-catalog-sort__selector__opt__input:focus-visible {
                    outline: none !important;
                }
            `;

            // Insert at the end of head to override other styles
            document.head.appendChild(style);
        },

        /**
         * Section titles embedded in images instead of HTML headings
         *
         * Issue: On the CSR Dashboard pages, section titles like "4 Quality Education"
         * are embedded in images (SDG logos) instead of being real HTML headings.
         * Screen readers cannot access this text, and the page loses semantic structure.
         *
         * Solution: Inject proper h3 headings before each SDG image, using the
         * official SDG titles translated to Dutch (matching the page language).
         */
        fixSDGImageHeadings: function() {
            // Only run on CSR dashboard pages
            if (!window.location.pathname.includes('csr_dashboard')) {
                return;
            }

            // SDG titles in Dutch (matching the site language)
            const sdgTitles = {
                'SDG04': '4. Kwaliteitsonderwijs',
                'SDG05': '5. Gendergelijkheid',
                'SDG07': '7. Betaalbare en duurzame energie',
                'SDG08': '8. Waardig werk en economische groei',
                'SDG09': '9. Industrie, innovatie en infrastructuur',
                'SDG11': '11. Duurzame steden en gemeenschappen',
                'SDG12': '12. Verantwoorde consumptie en productie',
                'SDG13': '13. Klimaatactie',
                'SDG15': '15. Leven op het land'
            };

            function applyFix(img) {
                // Skip if already fixed
                if (img.dataset.a11ySDGFixed) return;

                // Extract SDG number from image src
                const src = img.getAttribute('src') || '';
                const match = src.match(/SDG(\d+)/i);
                if (!match) return;

                const sdgKey = 'SDG' + match[1].padStart(2, '0');
                const title = sdgTitles[sdgKey];
                if (!title) return;

                // Find the container to insert the heading
                const sdgImageDiv = img.closest('.sdg-image');
                const card = img.closest('.horizontal-card') || img.closest('a');

                if (!card) return;

                // Create the heading (visually hidden, but accessible to screen readers)
                const heading = document.createElement('h3');
                heading.className = 'a11y-sdg-heading';
                heading.textContent = title;
                heading.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;white-space:nowrap;';

                // Insert heading at the beginning of the card, or before the image
                if (sdgImageDiv) {
                    sdgImageDiv.insertBefore(heading, sdgImageDiv.firstChild);
                } else {
                    card.insertBefore(heading, card.firstChild);
                }

                // Mark the image as decorative since heading now provides the text
                img.setAttribute('alt', '');
                img.setAttribute('role', 'presentation');

                img.dataset.a11ySDGFixed = 'true';
            }

            // Selector for SDG images
            const selector = 'img[src*="SDG"]';

            // Fix existing elements
            utils.selectAll(selector).forEach(applyFix);

            // Watch for dynamically added images (Angular)
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selector)) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll(selector).forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Dataset card items not in semantic lists
         *
         * Issue: On dataset cards, tags and action links are visually grouped
         * but not marked up as lists. Screen readers cannot announce the number
         * of items or their relationships.
         *
         * Solution: Wrap the tags and action links in semantic <ul>/<li> lists
         * to improve structural clarity for assistive technologies.
         */
        fixDatasetCardLists: function() {
            function wrapInList(container, itemSelector, listClass) {
                if (!container || container.dataset.a11yListFixed) return;

                const items = utils.selectAll(itemSelector, container);
                if (items.length === 0) return;

                // Create the list
                const ul = document.createElement('ul');
                ul.className = listClass;
                ul.style.cssText = 'list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:inherit;';

                // Move each item into a list item
                items.forEach(item => {
                    const li = document.createElement('li');
                    li.style.cssText = 'display:inline;';
                    // Clone the item and append to li
                    li.appendChild(item.cloneNode(true));
                    ul.appendChild(li);
                });

                // Replace container contents with the list
                container.replaceChildren(ul);

                container.dataset.a11yListFixed = 'true';
            }

            function applyFixes() {
                // Fix visualization/action links
                utils.selectAll('.ods-catalog-card__visualizations').forEach(container => {
                    wrapInList(container, 'a.ods-catalog-card__visualization', 'a11y-dataset-actions');
                });

                // Fix keyword tags
                utils.selectAll('.ods-catalog-card__keywords').forEach(container => {
                    wrapInList(container, 'ods-catalog-card-keyword, a.ods-catalog-card__keyword', 'a11y-dataset-tags');
                });
            }

            // Fix existing elements
            applyFixes();

            // Watch for dynamically added cards (Angular)
            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.querySelector && (
                                node.querySelector('.ods-catalog-card__visualizations') ||
                                node.querySelector('.ods-catalog-card__keywords') ||
                                node.matches('.ods-catalog-card__visualizations') ||
                                node.matches('.ods-catalog-card__keywords')
                            )) {
                                needsFix = true;
                            }
                        }
                    });
                });
                if (needsFix) {
                    // Debounce to avoid multiple rapid fixes
                    setTimeout(applyFixes, 100);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Table sort buttons use aria-label in wrong language
         *
         * Issue: Table sort buttons have English aria-labels even on French/Dutch
         * pages (e.g., "Sort column X in ascending order"). This is inconsistent
         * and harms usability for screen reader users.
         *
         * Solution: Detect the page language and translate the aria-labels to
         * the correct language.
         */
        fixTableSortLanguage: function() {
            // Translation patterns - column name is already translated, just the wrapper text needs translation
            const translations = {
                'nl': {
                    ascending: 'Kolom "{column}" oplopend sorteren',
                    descending: 'Kolom "{column}" aflopend sorteren'
                },
                'fr': {
                    ascending: 'Trier la colonne "{column}" par ordre croissant',
                    descending: 'Trier la colonne "{column}" par ordre décroissant'
                },
                'en': {
                    ascending: 'Sort column "{column}" in ascending order',
                    descending: 'Sort column "{column}" in descending order'
                }
            };

            // Get current language
            const lang = (document.documentElement.lang || 'nl').toLowerCase().split('-')[0];
            const t = translations[lang] || translations['nl'];

            function applyFix(button) {
                if (button.dataset.a11yLangFixed) return;

                const currentLabel = button.getAttribute('aria-label') || '';

                // Skip if already in target language (not English pattern)
                if (!currentLabel.startsWith('Sort column ')) return;

                // Extract column name from English label pattern
                let columnName = '';
                let isAscending = false;
                let isDescending = false;

                // Match "Sort column X in ascending order"
                const ascMatch = currentLabel.match(/^Sort column (.+) in ascending order$/i);
                if (ascMatch) {
                    columnName = ascMatch[1];
                    isAscending = true;
                }

                // Match "Sort column X in descending order"
                const descMatch = currentLabel.match(/^Sort column (.+) in descending order$/i);
                if (descMatch) {
                    columnName = descMatch[1];
                    isDescending = true;
                }

                if (!columnName) return;

                // Apply translated label
                let newLabel;
                if (isAscending) {
                    newLabel = t.ascending.replace('{column}', columnName);
                } else if (isDescending) {
                    newLabel = t.descending.replace('{column}', columnName);
                }

                if (newLabel) {
                    button.setAttribute('aria-label', newLabel);
                    button.dataset.a11yLangFixed = 'true';
                }
            }

            // Selector for table sort buttons
            const selector = '.odswidget-table__sort-icon';

            function applyToAll() {
                utils.selectAll(selector).forEach(applyFix);
            }

            // Fix existing elements
            applyToAll();

            // Watch for dynamically added buttons (Angular)
            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if ((node.matches && node.matches(selector)) ||
                                (node.querySelector && node.querySelector(selector))) {
                                needsFix = true;
                            }
                        }
                    });
                });
                if (needsFix) {
                    // Debounce for Angular rendering
                    setTimeout(applyToAll, 100);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix: Table header sort buttons announced with data cells,
         * and first cell of each row is not a row header
         *
         * Issue: Each <th> contains the column label and sort buttons.
         * When a screen reader navigates data cells, it announces the full
         * header content including the button labels, which is very verbose.
         * Additionally, the first cell of each data row is a <td> instead
         * of a <th scope="row">, so screen readers lack row context.
         *
         * Solution: Hide sort buttons from AT with aria-hidden and make the
         * <th> itself focusable for keyboard sorting (ng-click already handles
         * sort toggling). Convert first <td> of each row to <th scope="row">.
         */
        fixTableHeaderAnnouncement: function() {
            const thSelector = '.odswidget-table__header-cell';
            const rowSelector = '.odswidget-table__internal-table-row';

            function fixColumnHeaders() {
                utils.selectAll(thSelector).forEach(th => {
                    if (th.dataset.a11yHeaderFixed) return;

                    const sortIcons = th.querySelector('.odswidget-table__sort-icons');
                    if (sortIcons) {
                        // Hide sort buttons from AT - the <th> itself is the sort control
                        sortIcons.setAttribute('aria-hidden', 'true');

                        // Remove buttons from tab order (th handles keyboard now)
                        sortIcons.querySelectorAll('button').forEach(btn => {
                            btn.setAttribute('tabindex', '-1');
                        });
                    }

                    // Make the <th> itself keyboard-focusable for sorting
                    th.setAttribute('tabindex', '0');
                    th.style.cursor = 'pointer';

                    // Handle Enter/Space to trigger sort
                    th.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            th.click();
                        }
                    });

                    th.dataset.a11yHeaderFixed = 'true';
                });
            }

            function fixRowHeaders() {
                utils.selectAll(rowSelector).forEach(tr => {
                    if (tr.dataset.a11yRowHeaderFixed) return;

                    const firstCell = tr.querySelector('td.odswidget-table__cell');
                    if (!firstCell) return;

                    // Replace <td> with <th scope="row">
                    const th = document.createElement('th');
                    th.setAttribute('scope', 'row');
                    Array.from(firstCell.attributes).forEach(attr => {
                        th.setAttribute(attr.name, attr.value);
                    });
                    while (firstCell.firstChild) th.appendChild(firstCell.firstChild);
                    firstCell.replaceWith(th);

                    tr.dataset.a11yRowHeaderFixed = 'true';
                });
            }

            function applyToAll() {
                fixColumnHeaders();
                fixRowHeaders();
            }

            // Fix existing elements
            applyToAll();

            // Watch for dynamically added table content
            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if ((node.matches && (node.matches(thSelector) || node.matches(rowSelector))) ||
                                (node.querySelector && (node.querySelector(thSelector) || node.querySelector(rowSelector)))) {
                                needsFix = true;
                            }
                        }
                    });
                });
                if (needsFix) setTimeout(applyToAll, 100);
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Dynamic update of dataset count is not announced to screen readers
         *
         * Issue: When a user applies a filter or clicks on a tag, the dataset count
         * in the h1 is updated visually but not announced to screen reader users.
         * The h1 may have aria-live="polite" but changes happen in child spans,
         * so screen readers don't announce the updates.
         *
         * Solution: Add aria-atomic="true" to ensure the entire content is
         * announced when any child element changes.
         */
        fixDatasetCountAnnouncements: function() {
            // Selectors for elements that display dynamic counts
            const countSelectors = [
                // Main dataset count heading with the count spans inside
                'h1.ods-filters__count',
                '.ods-filters__count',
                // Results count in catalog
                '.ods-result-count',
                '.odswidget-results-count'
            ];

            function applyFix(element) {
                if (element.dataset.a11yLiveFixed) return;

                // Ensure aria-live is set (may already be there)
                if (!element.hasAttribute('aria-live')) {
                    element.setAttribute('aria-live', 'polite');
                }

                // Add aria-atomic to ensure entire content is announced on change
                // This is crucial when the actual text changes happen in child spans
                element.setAttribute('aria-atomic', 'true');

                element.dataset.a11yLiveFixed = 'true';
            }

            function applyToAll() {
                countSelectors.forEach(selector => {
                    utils.selectAll(selector).forEach(applyFix);
                });
            }

            // Fix existing elements
            applyToAll();

            // Watch for dynamically added elements (Angular)
            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            countSelectors.forEach(selector => {
                                if ((node.matches && node.matches(selector)) ||
                                    (node.querySelector && node.querySelector(selector))) {
                                    needsFix = true;
                                }
                            });
                        }
                    });
                });
                if (needsFix) {
                    setTimeout(applyToAll, 100);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Active filters indicated by color only
         *
         * Issue: Active/selected filters differ from inactive only by background color
         * (light blue). The state change is not communicated to:
         * - Users who cannot distinguish colors (color vision deficiencies)
         * - Screen reader users (no programmatic state exposed)
         * - Keyboard/touch users (the +/- symbol only appears on hover)
         *
         * Solution: Add a visible checkbox indicator that shows selected/unselected
         * state. No role="checkbox" is added because these are links that trigger
         * a page update, and a checkbox role would imply no immediate action.
         */
        fixFilterCheckboxState: function() {
            // Inject CSS to hide the hover +/- indicators (now redundant)
            const style = document.createElement('style');
            style.id = 'a11y-filter-checkbox-fix';
            style.textContent = `
                /* Hide the +/- hover indicators - checkboxes now show state */
                .odswidget-facet__category::before,
                .odswidget-facet__category::after {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);

            function applyFix(filterLink) {
                // Skip if already processed for checkbox state
                if (filterLink.dataset.a11yCheckboxFixed) return;

                const isRefined = filterLink.classList.contains('odswidget-facet__category--refined');

                // Create visible checkbox indicator
                const checkbox = document.createElement('span');
                checkbox.className = 'a11y-filter-checkbox';
                checkbox.setAttribute('aria-hidden', 'true');
                checkbox.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 16px;
                    height: 16px;
                    min-width: 16px;
                    border: 2px solid currentColor;
                    border-radius: 3px;
                    margin-right: 8px;
                    font-size: 12px;
                    line-height: 1;
                    vertical-align: middle;
                    transition: background-color 0.15s, border-color 0.15s;
                `;

                // Set initial visual state
                updateCheckboxVisual(checkbox, isRefined);

                // Insert checkbox at the beginning of the link
                filterLink.insertBefore(checkbox, filterLink.firstChild);

                // Watch for class changes (when filter state changes)
                const classObserver = new MutationObserver(mutations => {
                    mutations.forEach(mutation => {
                        if (mutation.attributeName === 'class') {
                            const nowRefined = filterLink.classList.contains('odswidget-facet__category--refined');
                            updateCheckboxVisual(checkbox, nowRefined);
                        }
                    });
                });

                classObserver.observe(filterLink, { attributes: true, attributeFilter: ['class'] });

                filterLink.dataset.a11yCheckboxFixed = 'true';
            }

            function updateCheckboxVisual(checkbox, isChecked) {
                if (isChecked) {
                    checkbox.textContent = '\u2713';
                    checkbox.style.backgroundColor = '#025da4';
                    checkbox.style.borderColor = '#025da4';
                    checkbox.style.color = '#ffffff';
                } else {
                    checkbox.textContent = '';
                    checkbox.style.backgroundColor = 'transparent';
                    checkbox.style.borderColor = 'currentColor';
                    checkbox.style.color = 'currentColor';
                }
            }

            // Selector for facet category links
            const selector = 'a.odswidget-facet__category';

            // Fix existing elements
            utils.selectAll(selector).forEach(applyFix);

            // Watch for dynamically added filters (Angular)
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selector)) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll(selector).forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Sticky header takes over entire viewport at 400% zoom
         *
         * Issue: When users zoom to 400% (often required for low vision), the sticky
         * .ods-filters header with active filters consumes most/all of the viewport,
         * leaving little or no space for actual content. The combination of:
         * - position: sticky on .ods-filters
         * - multiple active filter chips
         * - limited vertical viewport at high zoom
         * makes the page essentially unusable.
         *
         * Solution: At small viewport heights (which occur at high zoom), disable
         * sticky positioning and limit the filters area height with overflow scroll.
         * This ensures content remains accessible while filters are still available.
         */
        fixStickyHeaderZoom: function() {
            const style = document.createElement('style');
            style.id = 'a11y-sticky-header-zoom-fix';
            style.textContent = `
                /* At small viewport heights (high zoom), disable sticky and limit filter height */
                @media (max-height: 500px) {
                    /* Disable sticky positioning */
                    .ods-filters {
                        position: static !important;
                    }

                    /* Limit active filters area height with scroll */
                    .ods-filters__filters-summary {
                        max-height: 30vh !important;
                        overflow-y: auto !important;
                    }

                    /* Visual indicator that area is scrollable */
                    .ods-filters__filters-summary::-webkit-scrollbar {
                        width: 8px;
                    }
                    .ods-filters__filters-summary::-webkit-scrollbar-thumb {
                        background: rgba(0, 0, 0, 0.3);
                        border-radius: 4px;
                    }
                }

                /* At very small viewport heights, further reduce filter area */
                @media (max-height: 350px) {
                    .ods-filters__filters-summary {
                        max-height: 20vh !important;
                    }
                }

                /* Also handle narrow widths (alternative zoom scenario) */
                @media (max-width: 400px) {
                    .ods-filters {
                        position: static !important;
                    }

                    .ods-filters__filters-summary {
                        max-height: 40vh !important;
                        overflow-y: auto !important;
                    }
                }
            `;

            document.head.appendChild(style);
        },

        /**
         * Tabs on dataset detail pages not implemented according to ARIA tab pattern
         *
         * Issue: Tab interfaces have role="tablist/tab/tabpanel" but are missing:
         * - aria-selected on tabs
         * - aria-controls/aria-labelledby linking tabs and panels
         * - Proper tabindex management
         * - Arrow key navigation
         *
         * Solution: Enhance existing ods-tabs with the missing ARIA attributes
         * and keyboard navigation per W3C ARIA Authoring Practices.
         */
        fixTabsAriaPattern: function() {
            function applyFix(tabsContainer) {
                if (tabsContainer.dataset.a11yTabsFixed) return;

                // Find the tab list container (has role="tablist")
                const tabList = tabsContainer.querySelector('.ods-tabs__tabs');
                if (!tabList) return;

                // Replace <a> tabs with <button> tabs (ARIA tab pattern requires buttons, not links)
                utils.selectAll('a.ods-tabs__tab[role="tab"]', tabList).forEach(aTab => {
                    var button = document.createElement('button');
                    button.setAttribute('type', 'button');

                    // Copy classes and relevant attributes
                    button.className = aTab.className;
                    Array.from(aTab.attributes).forEach(attr => {
                        if (attr.name === 'href' || attr.name === 'class' || attr.name.startsWith('ng-')) return;
                        button.setAttribute(attr.name, attr.value);
                    });
                    while (aTab.firstChild) button.appendChild(aTab.firstChild.cloneNode(true));

                    // Hide original <a> but keep for Angular bindings
                    aTab.style.display = 'none';
                    aTab.setAttribute('aria-hidden', 'true');
                    aTab.setAttribute('tabindex', '-1');
                    aTab.removeAttribute('role');

                    // Insert button before the hidden <a>
                    aTab.parentNode.insertBefore(button, aTab);

                    // Proxy click to original <a> so ng-click fires
                    button.addEventListener('click', function(e) {
                        e.preventDefault();
                        aTab.click();
                    });

                    // Sync active class from <a> to <button> when Angular updates
                    var syncObserver = new MutationObserver(function() {
                        button.className = aTab.className;
                    });
                    syncObserver.observe(aTab, { attributes: true, attributeFilter: ['class'] });
                });

                // Find tab buttons (have role="tab") and panels (have role="tabpanel")
                const tabs = utils.selectAll('.ods-tabs__tab[role="tab"]', tabList);
                const panels = utils.selectAll('.ods-tabs__pane[role="tabpanel"]', tabsContainer);

                if (tabs.length === 0) return;

                // Get slug-based mapping between tabs and panels
                // Tabs have class like "ods-tabs__tab information" where "information" is the slug
                // Panels have attribute slug="information"
                tabs.forEach((tab, index) => {
                    // Generate unique IDs
                    const tabId = tab.id || ('a11y-tab-' + Math.random().toString(36).substr(2, 9));
                    tab.id = tabId;

                    // Extract slug from tab classes (it's a class that matches panel slug)
                    const tabClasses = Array.from(tab.classList);
                    let matchingPanel = null;

                    // Try to find matching panel by slug
                    for (const cls of tabClasses) {
                        if (cls !== 'ods-tabs__tab' && !cls.includes('--')) {
                            // This might be the slug class
                            matchingPanel = tabsContainer.querySelector(`.ods-tabs__pane[slug="${cls}"]`);
                            if (matchingPanel) break;
                        }
                    }

                    // Fallback to index-based matching
                    if (!matchingPanel && panels[index]) {
                        matchingPanel = panels[index];
                    }

                    // Check if this tab is active
                    const isActive = tab.classList.contains('ods-tabs__tab--active');

                    // Set aria-selected
                    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');

                    // Set tabindex (only active tab should be in tab order)
                    tab.setAttribute('tabindex', isActive ? '0' : '-1');

                    // Link tab to panel
                    if (matchingPanel) {
                        const panelId = matchingPanel.id || ('a11y-panel-' + Math.random().toString(36).substr(2, 9));
                        matchingPanel.id = panelId;

                        tab.setAttribute('aria-controls', panelId);
                        matchingPanel.setAttribute('aria-labelledby', tabId);

                        // Make active panel focusable
                        if (matchingPanel.classList.contains('ods-tabs__pane--active')) {
                            matchingPanel.setAttribute('tabindex', '0');
                        }
                    }

                    // Add keyboard navigation (only add once)
                    if (!tab.dataset.a11yKeyboardAdded) {
                        tab.addEventListener('keydown', function(e) {
                            const currentTabs = utils.selectAll('.ods-tabs__tab[role="tab"]:not([style*="display: none"]):not(.ng-hide)', tabList);
                            const currentIndex = currentTabs.indexOf(tab);
                            let targetIndex = -1;

                            switch (e.key) {
                                case 'ArrowLeft':
                                case 'ArrowUp':
                                    e.preventDefault();
                                    targetIndex = currentIndex - 1;
                                    if (targetIndex < 0) targetIndex = currentTabs.length - 1;
                                    break;
                                case 'ArrowRight':
                                case 'ArrowDown':
                                    e.preventDefault();
                                    targetIndex = currentIndex + 1;
                                    if (targetIndex >= currentTabs.length) targetIndex = 0;
                                    break;
                                case 'Home':
                                    e.preventDefault();
                                    targetIndex = 0;
                                    break;
                                case 'End':
                                    e.preventDefault();
                                    targetIndex = currentTabs.length - 1;
                                    break;
                            }

                            if (targetIndex >= 0) {
                                const targetTab = currentTabs[targetIndex];
                                if (targetTab && !targetTab.classList.contains('ods-tabs__tab--disabled')) {
                                    // Click to activate the tab
                                    targetTab.click();

                                    // Re-focus after Angular updates the DOM
                                    // Use multiple timeouts to ensure focus is restored
                                    setTimeout(function() {
                                        // Re-query tabs in case DOM changed
                                        const updatedTabs = utils.selectAll('.ods-tabs__tab[role="tab"]:not([style*="display: none"]):not(.ng-hide)', tabList);
                                        const tabToFocus = updatedTabs[targetIndex];
                                        if (tabToFocus) {
                                            tabToFocus.focus();
                                            tabToFocus.setAttribute('tabindex', '0');
                                        }
                                    }, 50);

                                    // Second attempt in case Angular is slow
                                    setTimeout(function() {
                                        const updatedTabs = utils.selectAll('.ods-tabs__tab[role="tab"]:not([style*="display: none"]):not(.ng-hide)', tabList);
                                        const tabToFocus = updatedTabs[targetIndex];
                                        if (tabToFocus && document.activeElement !== tabToFocus) {
                                            tabToFocus.focus();
                                        }
                                    }, 150);
                                }
                            }
                        });
                        tab.dataset.a11yKeyboardAdded = 'true';
                    }
                });

                // Watch for active tab changes and update aria-selected/tabindex
                const tabObserver = new MutationObserver(mutations => {
                    mutations.forEach(mutation => {
                        if (mutation.attributeName === 'class') {
                            const tab = mutation.target;
                            if (tab.getAttribute('role') === 'tab') {
                                const isNowActive = tab.classList.contains('ods-tabs__tab--active');
                                tab.setAttribute('aria-selected', isNowActive ? 'true' : 'false');
                                tab.setAttribute('tabindex', isNowActive ? '0' : '-1');
                            }
                            // Also update panel tabindex
                            if (mutation.target.classList.contains('ods-tabs__pane')) {
                                const panel = mutation.target;
                                const isNowActive = panel.classList.contains('ods-tabs__pane--active');
                                panel.setAttribute('tabindex', isNowActive ? '0' : '-1');
                            }
                        }
                    });
                });

                tabs.forEach(tab => {
                    tabObserver.observe(tab, { attributes: true, attributeFilter: ['class'] });
                });

                panels.forEach(panel => {
                    tabObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
                });

                tabsContainer.dataset.a11yTabsFixed = 'true';
            }

            // Selectors for tab containers
            const containerSelector = '.ods-tabs[role="tablist"]';

            function applyToAll() {
                utils.selectAll(containerSelector).forEach(applyFix);
            }

            // Fix existing elements
            applyToAll();

            // Watch for dynamically added tabs (Angular)
            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if ((node.matches && node.matches(containerSelector)) ||
                                (node.querySelector && node.querySelector(containerSelector))) {
                                needsFix = true;
                            }
                        }
                    });
                });
                if (needsFix) {
                    setTimeout(applyToAll, 200);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix: Table header and body in separate tables + missing aria-sort
         *
         * Issue: The ods-table widget renders column headers (<thead>) in a
         * separate <table> from the data rows (<tbody>) for sticky header
         * behavior. This breaks the semantic link between headers and cells —
         * screen readers cannot associate columns with their headings.
         * Additionally, sorted columns don't expose aria-sort state.
         *
         * Solution: Move the real <thead> (with sort buttons) from the header
         * table into the body table, hide the now-empty header table visually,
         * remove the original hidden <thead> in the body table, and use
         * CSS position:sticky on the <th> cells to preserve the sticky effect.
         * Also add aria-sort attributes to reflect current sort state.
         */
        fixTableSplitHeaders: function() {
            const style = document.createElement('style');
            style.id = 'a11y-table-split-headers-fix';
            style.textContent = `
                /* Hide the original separate header container */
                .odswidget-table.a11y-table-merged .odswidget-table__header {
                    display: none !important;
                }

                /* Make the records container fill the widget and scroll */
                .odswidget-table.a11y-table-merged .odswidget-table__records {
                    height: 100% !important;
                    overflow: auto !important;
                }

                /* Sticky header cells inside the merged table */
                .odswidget-table.a11y-table-merged .a11y-merged-thead .odswidget-table__header-cell {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    background-color: #e8e8e8;
                }
            `;
            document.head.appendChild(style);

            // Sort state translations
            const lang = (document.documentElement.lang || 'nl').toLowerCase().split('-')[0];
            const sortLabels = {
                'nl': { ascending: 'oplopend gesorteerd', descending: 'aflopend gesorteerd' },
                'fr': { ascending: 'trié par ordre croissant', descending: 'trié par ordre décroissant' },
                'en': { ascending: 'sorted ascending', descending: 'sorted descending' }
            };
            const t = sortLabels[lang] || sortLabels['nl'];

            function updateAriaSortStates(tableWidget) {
                const headerCells = utils.selectAll('.a11y-merged-thead .odswidget-table__header-cell', tableWidget);
                headerCells.forEach(cell => {
                    const sortIcons = cell.querySelector('.odswidget-table__sort-icons');
                    if (!sortIcons) return;

                    const ascActive = sortIcons.querySelector('.odswidget-table__sort-icons__up--active');
                    const descActive = sortIcons.querySelector('.odswidget-table__sort-icons__down--active');

                    if (ascActive) {
                        cell.setAttribute('aria-sort', 'ascending');
                    } else if (descActive) {
                        cell.setAttribute('aria-sort', 'descending');
                    } else {
                        cell.removeAttribute('aria-sort');
                    }
                });
            }

            function applyFix(tableWidget) {
                if (tableWidget.dataset.a11yTableSplitFixed) return;

                const headerContainer = tableWidget.querySelector('.odswidget-table__header');
                const recordsContainer = tableWidget.querySelector('.odswidget-table__records');
                if (!headerContainer || !recordsContainer) return;

                // Find the header table's thead and the body table
                const headerTable = headerContainer.querySelector('table');
                const bodyTable = recordsContainer.querySelector('table');
                if (!headerTable || !bodyTable) return;

                const thead = headerTable.querySelector('thead');
                if (!thead) return;

                // Remove the hidden duplicate thead from the body table
                const hiddenThead = bodyTable.querySelector('.odswidget-table__internal-header-table-header');
                if (hiddenThead) {
                    hiddenThead.remove();
                }

                // Move the real thead into the body table
                thead.classList.add('a11y-merged-thead');

                // Ensure header cells are <th> for proper semantics
                utils.selectAll('td.odswidget-table__header-cell', thead).forEach(td => {
                    const th = document.createElement('th');
                    while (td.firstChild) th.appendChild(td.firstChild);
                    Array.from(td.attributes).forEach(attr => {
                        th.setAttribute(attr.name, attr.value);
                    });
                    th.setAttribute('scope', 'col');
                    td.parentNode.replaceChild(th, td);
                });

                // Also add scope="col" to any existing th elements
                utils.selectAll('th.odswidget-table__header-cell', thead).forEach(th => {
                    th.setAttribute('scope', 'col');
                });

                bodyTable.insertBefore(thead, bodyTable.firstChild);

                // Mark widget so CSS kicks in
                tableWidget.classList.add('a11y-table-merged');

                // Set initial aria-sort states
                updateAriaSortStates(tableWidget);

                // Watch for sort state changes (class changes on sort icons)
                const sortObserver = new MutationObserver(() => {
                    updateAriaSortStates(tableWidget);
                });
                sortObserver.observe(thead, {
                    attributes: true,
                    attributeFilter: ['class'],
                    subtree: true
                });

                tableWidget.dataset.a11yTableSplitFixed = 'true';
            }

            const selector = '.odswidget-table';

            // Fix existing elements
            utils.selectAll(selector).forEach(applyFix);

            // Watch for dynamically added tables (Angular)
            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if ((node.matches && node.matches(selector)) ||
                                (node.querySelector && node.querySelector(selector))) {
                                needsFix = true;
                            }
                        }
                    });
                });
                if (needsFix) {
                    setTimeout(() => utils.selectAll(selector).forEach(applyFix), 100);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix: Analyze tab charts not accessible for keyboard/screen reader users
         *
         * Issue: The "Analyse" tab displays data as interactive charts (canvas-based)
         * that are not accessible to:
         * - Keyboard users (cannot navigate data points)
         * - Screen reader users (no text alternative for the visual data)
         * - Users who need to copy/paste data
         *
         * Solution: Intercept the chart data API requests and provide an accessible
         * HTML table alternative. Add a toggle button to show/hide the data table.
         * The table includes proper headers, scope attributes, and is keyboard navigable.
         */
        fixAnalyzeChartAccessibility: function() {
            // Only run on dataset pages with analyze tab
            if (!window.location.pathname.includes('/explore/dataset/')) {
                return;
            }

            // Store captured chart data
            let capturedChartData = null;
            let chartContainer = null;

            // Month names for formatting
            const monthNames = {
                'nl': ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
                       'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
                'fr': ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                       'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
                'en': ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']
            };

            const lang = (document.documentElement.lang || 'nl').toLowerCase().split('-')[0];
            const months = monthNames[lang] || monthNames['nl'];

            // Labels for UI elements
            const labels = {
                'nl': {
                    chartView: 'Grafiek',
                    tableView: 'Tabel',
                    viewAs: 'Weergave kiezen',
                    tableCaption: 'Grafiekdata in tabelvorm',
                    period: 'Periode',
                    category: 'Categorie',
                    value: 'Waarde',
                    total: 'Totaal',
                    noData: 'Geen data beschikbaar'
                },
                'fr': {
                    chartView: 'Graphique',
                    tableView: 'Tableau',
                    viewAs: 'Choisir l\'affichage',
                    tableCaption: 'Données du graphique sous forme de tableau',
                    period: 'Période',
                    category: 'Catégorie',
                    value: 'Valeur',
                    total: 'Total',
                    noData: 'Aucune donnée disponible'
                },
                'en': {
                    chartView: 'Chart',
                    tableView: 'Table',
                    viewAs: 'Choose view',
                    tableCaption: 'Chart data in table format',
                    period: 'Period',
                    category: 'Category',
                    value: 'Value',
                    total: 'Total',
                    noData: 'No data available'
                }
            };
            const t = labels[lang] || labels['nl'];

            // Register interceptor for analyze chart data
            onApiResponse(
                function(url) {
                    return url.includes('/api/explore/v2.1/catalog/datasets/') && url.includes('/analyze');
                },
                function(data) {
                    if (Array.isArray(data) && data.length > 0) {
                        capturedChartData = data;
                        setTimeout(function() { tryRenderTable(); }, 500);
                    }
                }
            );

            function formatXValue(x) {
                if (typeof x === 'object' && x !== null) {
                    // Time series data: {year: 2020, month: 1}
                    if ('year' in x && 'month' in x && Object.keys(x).length === 2) {
                        return months[x.month - 1] + ' ' + x.year;
                    }

                    // Year only: {year: 2020}
                    if ('year' in x && Object.keys(x).length === 1) {
                        return String(x.year);
                    }

                    // Complex grouped data - extract meaningful values
                    // e.g., {"type_ongeval":"Andere","empty":{"year":2010}}
                    const categoryParts = [];
                    let timePart = null;

                    for (const [key, value] of Object.entries(x)) {
                        if (typeof value === 'object' && value !== null) {
                            // Nested object - likely contains time dimension
                            if ('year' in value && 'month' in value) {
                                timePart = months[value.month - 1] + ' ' + value.year;
                            } else if ('year' in value) {
                                timePart = String(value.year);
                            } else if ('month' in value) {
                                timePart = months[value.month - 1];
                            }
                        } else if (value !== null && value !== undefined && value !== '') {
                            // String/number value - this is a category
                            categoryParts.push(String(value));
                        }
                    }

                    // Combine category and time parts
                    const allParts = [...categoryParts];
                    if (timePart) {
                        allParts.push(timePart);
                    }

                    if (allParts.length > 0) {
                        return allParts.join(' - ');
                    }

                    // Fallback to JSON (shouldn't reach here normally)
                    return JSON.stringify(x);
                }
                // Simple string/number
                return String(x);
            }

            function getSeriesKeys(data) {
                if (!data || data.length === 0) return [];
                const firstRow = data[0];
                return Object.keys(firstRow).filter(key => key !== 'x' && key.startsWith('serie'));
            }

            function getSeriesLabels(seriesKeys) {
                const labels = {};

                // Source 1: Try Highcharts legend first - this shows exactly what users see
                // Look specifically in the analyze pane to avoid picking up other charts
                const analyzePane = document.querySelector('.ods-tabs__pane[slug="analyze"]');
                const legendContainer = analyzePane || document;

                // Try div-based legend first (most common)
                let legendTexts = [];
                const divLegendItems = legendContainer.querySelectorAll('div.highcharts-legend-item > span');
                if (divLegendItems.length > 0) {
                    legendTexts = Array.from(divLegendItems)
                        .map(el => el.textContent.trim())
                        .filter(text => text.length > 0);
                }

                // Fall back to SVG-based legend
                if (legendTexts.length === 0) {
                    const svgLegendItems = legendContainer.querySelectorAll('.highcharts-legend-item text tspan, .highcharts-legend-item text');
                    if (svgLegendItems.length > 0) {
                        legendTexts = Array.from(svgLegendItems)
                            .map(el => el.textContent.trim())
                            .filter(text => text.length > 0);
                    }
                }

                if (legendTexts.length > 0) {
                    seriesKeys.forEach((key, index) => {
                        if (legendTexts[index]) {
                            labels[key] = legendTexts[index];
                        }
                    });

                    if (Object.keys(labels).length > 0) {
                        return labels;
                    }
                }

                // Source 2: Fall back to chart control select elements
                // Each series is in a <li class="ods-chart-controls__serie-container">
                try {
                    const serieContainers = document.querySelectorAll('.ods-chart-controls__serie-container');

                    if (serieContainers.length > 0) {
                        serieContainers.forEach((container, index) => {
                            const key = 'serie1-' + (index + 1);
                            if (!seriesKeys.includes(key)) return;

                            const serieControlDiv = container.querySelector('[ods-chart-control-serie]');
                            if (!serieControlDiv) return;

                            const allFuncControls = serieControlDiv.querySelectorAll('[ods-chart-control-serie-function]');
                            let mainFuncControl = null;

                            for (const ctrl of allFuncControls) {
                                if (ctrl.hasAttribute('subserie')) continue;
                                if (ctrl.closest('[ng-show="isRangeChart"]') || ctrl.closest('[ng-show="serie.type === \'boxplot\'"]')) continue;
                                const parent = ctrl.closest('.ng-hide');
                                if (parent && serieControlDiv.contains(parent)) continue;
                                mainFuncControl = ctrl;
                                break;
                            }

                            if (!mainFuncControl) return;

                            const funcSelect = mainFuncControl.querySelector('select[ng-model="serie.func"]');
                            let funcLabel = '';
                            if (funcSelect && funcSelect.selectedOptions && funcSelect.selectedOptions[0]) {
                                funcLabel = funcSelect.selectedOptions[0].label || funcSelect.selectedOptions[0].text;
                            }

                            const yAxisSelect = mainFuncControl.querySelector('select[ng-model="serie.yAxis"]');
                            let fieldLabel = '';
                            if (yAxisSelect && yAxisSelect.selectedOptions && yAxisSelect.selectedOptions[0]) {
                                fieldLabel = yAxisSelect.selectedOptions[0].label || yAxisSelect.selectedOptions[0].text;
                            }

                            let label = funcLabel;
                            if (fieldLabel) {
                                label += ' ' + fieldLabel;
                            }

                            if (label.trim()) {
                                labels[key] = label.trim();
                            }
                        });

                        if (Object.keys(labels).length > 0) {
                            return labels;
                        }
                    }
                } catch (e) {
                }

                // Fallback: use generic names
                seriesKeys.forEach((key, index) => {
                    labels[key] = 'Serie ' + (index + 1);
                });
                return labels;
            }

            function createDataTable(data) {
                const seriesKeys = getSeriesKeys(data);
                const seriesLabels = getSeriesLabels(seriesKeys);
                const isTimeSeries = data[0]?.x && typeof data[0].x === 'object' && 'year' in data[0].x;

                const table = document.createElement('table');
                table.className = 'a11y-chart-data-table';
                table.style.cssText = `
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 1rem;
                    font-size: 0.9rem;
                `;

                // Caption
                const caption = document.createElement('caption');
                caption.textContent = t.tableCaption;
                caption.style.cssText = 'font-weight: bold; padding: 0.5rem; text-align: left;';
                table.appendChild(caption);

                // Header
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');

                const thX = document.createElement('th');
                thX.scope = 'col';
                thX.textContent = isTimeSeries ? t.period : t.category;
                thX.style.cssText = 'border: 1px solid #ccc; padding: 0.5rem; background: #f5f5f5; text-align: left;';
                headerRow.appendChild(thX);

                // If only one series, show the label or "Value"
                // If multiple series, show series labels
                seriesKeys.forEach(serieKey => {
                    const th = document.createElement('th');
                    th.scope = 'col';
                    th.textContent = seriesLabels[serieKey] || t.value;
                    th.style.cssText = 'border: 1px solid #ccc; padding: 0.5rem; background: #f5f5f5; text-align: right;';
                    headerRow.appendChild(th);
                });

                thead.appendChild(headerRow);
                table.appendChild(thead);

                // Body
                const tbody = document.createElement('tbody');
                data.forEach((row, index) => {
                    const tr = document.createElement('tr');
                    tr.style.cssText = index % 2 === 0 ? 'background: #fff;' : 'background: #fafafa;';

                    // X value (row header)
                    const th = document.createElement('th');
                    th.scope = 'row';
                    th.textContent = formatXValue(row.x);
                    th.style.cssText = 'border: 1px solid #ccc; padding: 0.5rem; text-align: left; font-weight: normal;';
                    tr.appendChild(th);

                    // Data values
                    seriesKeys.forEach(serieKey => {
                        const td = document.createElement('td');
                        const value = row[serieKey];
                        td.textContent = value !== null && value !== undefined ?
                            Number(value).toLocaleString(lang) : '-';
                        td.style.cssText = 'border: 1px solid #ccc; padding: 0.5rem; text-align: right;';
                        tr.appendChild(td);
                    });

                    tbody.appendChild(tr);
                });

                table.appendChild(tbody);
                return table;
            }

            function createViewSwitcher(chartElement) {
                const container = document.createElement('div');
                container.id = 'a11y-chart-view-switcher';
                container.style.cssText = 'margin-top: 1rem;';

                // Tablist for switching between chart and table view
                const tablist = document.createElement('div');
                tablist.setAttribute('role', 'tablist');
                tablist.setAttribute('aria-label', t.viewAs);
                tablist.style.cssText = `
                    display: inline-flex;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 1rem;
                `;

                // Tab button styles
                const tabStyle = `
                    padding: 0.5rem 1rem;
                    border: none;
                    background: #f5f5f5;
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: #333;
                    transition: background 0.15s, color 0.15s;
                `;
                const activeTabStyle = `
                    padding: 0.5rem 1rem;
                    border: none;
                    background: #025da4;
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: white;
                    transition: background 0.15s, color 0.15s;
                `;

                // Chart tab (active by default)
                const chartTab = document.createElement('button');
                chartTab.type = 'button';
                chartTab.id = 'a11y-tab-chart';
                chartTab.setAttribute('role', 'tab');
                chartTab.setAttribute('aria-selected', 'true');
                chartTab.setAttribute('aria-controls', 'a11y-panel-chart');
                chartTab.setAttribute('tabindex', '0');
                chartTab.textContent = t.chartView;
                chartTab.style.cssText = activeTabStyle;

                // Table tab
                const tableTab = document.createElement('button');
                tableTab.type = 'button';
                tableTab.id = 'a11y-tab-table';
                tableTab.setAttribute('role', 'tab');
                tableTab.setAttribute('aria-selected', 'false');
                tableTab.setAttribute('aria-controls', 'a11y-panel-table');
                tableTab.setAttribute('tabindex', '-1');
                tableTab.textContent = t.tableView;
                tableTab.style.cssText = tabStyle;

                tablist.appendChild(chartTab);
                tablist.appendChild(tableTab);

                // Chart panel (wraps the existing chart)
                const chartPanel = document.createElement('div');
                chartPanel.id = 'a11y-panel-chart';
                chartPanel.setAttribute('role', 'tabpanel');
                chartPanel.setAttribute('aria-labelledby', 'a11y-tab-chart');
                chartPanel.setAttribute('tabindex', '0');
                // Chart element will be moved here

                // Table panel (hidden by default)
                const tablePanel = document.createElement('div');
                tablePanel.id = 'a11y-panel-table';
                tablePanel.setAttribute('role', 'tabpanel');
                tablePanel.setAttribute('aria-labelledby', 'a11y-tab-table');
                tablePanel.setAttribute('tabindex', '0');
                tablePanel.style.cssText = 'display: none; max-height: 500px; overflow: auto;';

                // Tab switching logic
                function activateTab(selectedTab) {
                    const tabs = [chartTab, tableTab];
                    const panels = [chartPanel, tablePanel];

                    tabs.forEach((tab, index) => {
                        const isSelected = tab === selectedTab;
                        tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                        tab.setAttribute('tabindex', isSelected ? '0' : '-1');
                        tab.style.cssText = isSelected ? activeTabStyle : tabStyle;
                        panels[index].style.display = isSelected ? 'block' : 'none';
                    });

                    // Render table data when table tab is selected
                    if (selectedTab === tableTab && capturedChartData) {
                        if (!tablePanel.querySelector('table')) {
                            const table = createDataTable(capturedChartData);
                            tablePanel.appendChild(table);
                        }
                    }

                    selectedTab.focus();
                }

                // Click handlers
                chartTab.addEventListener('click', () => activateTab(chartTab));
                tableTab.addEventListener('click', () => activateTab(tableTab));

                // Keyboard navigation (arrow keys)
                [chartTab, tableTab].forEach(tab => {
                    tab.addEventListener('keydown', (e) => {
                        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                            e.preventDefault();
                            activateTab(tab === chartTab ? tableTab : chartTab);
                        }
                    });
                });

                // Hover styles
                [chartTab, tableTab].forEach(tab => {
                    tab.addEventListener('mouseenter', function() {
                        if (this.getAttribute('aria-selected') !== 'true') {
                            this.style.background = '#e0e0e0';
                        }
                    });
                    tab.addEventListener('mouseleave', function() {
                        if (this.getAttribute('aria-selected') !== 'true') {
                            this.style.background = '#f5f5f5';
                        }
                    });
                });

                container.appendChild(tablist);
                container.appendChild(chartPanel);
                container.appendChild(tablePanel);

                return { container, chartPanel, tablePanel };
            }

            function tryRenderTable() {
                // Find the chart container on the analyze tab
                const analyzePane = document.querySelector('.ods-tabs__pane[slug="analyze"]');
                if (!analyzePane) return;

                // Check if we're on the analyze tab
                if (!analyzePane.classList.contains('ods-tabs__pane--active')) return;

                // Check if view switcher already exists
                if (document.getElementById('a11y-chart-view-switcher')) {
                    // Update existing table if data changed
                    const tablePanel = document.getElementById('a11y-panel-table');
                    if (tablePanel && capturedChartData) {
                        const existingTable = tablePanel.querySelector('table');
                        if (existingTable) {
                            tablePanel.replaceChildren(createDataTable(capturedChartData));
                        }
                    }
                    return;
                }

                // Find the chart widget to wrap
                const chartWidget = analyzePane.querySelector('.odswidget-charts, .ods-analyze__charts, .ods-chart, [ods-chart]');
                if (!chartWidget) {
                    return;
                }

                // Find the parent container that holds the chart
                const chartParent = chartWidget.parentNode;

                // Create the view switcher
                const { container, chartPanel, tablePanel } = createViewSwitcher(chartWidget);

                // Move the chart widget into the chart panel
                chartPanel.appendChild(chartWidget);

                // Insert the view switcher where the chart was
                chartParent.appendChild(container);

            }

            // Watch for tab changes to render table when analyze tab becomes active
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    if (mutation.attributeName === 'class') {
                        const target = mutation.target;
                        if (target.classList.contains('ods-tabs__pane') &&
                            target.getAttribute('slug') === 'analyze' &&
                            target.classList.contains('ods-tabs__pane--active')) {
                            setTimeout(() => tryRenderTable(), 500);
                        }
                    }
                });
            });

            // Start observing when DOM is ready
            utils.ready(function() {
                const tabsContainer = document.querySelector('.ods-tabs');
                if (tabsContainer) {
                    observer.observe(tabsContainer, {
                        attributes: true,
                        attributeFilter: ['class'],
                        subtree: true
                    });
                }

                // Also try to render immediately if already on analyze tab
                setTimeout(() => tryRenderTable(), 1000);
            });

        },

        // Add more fixes here as needed...

        /**
         * Fix: Custom page charts not accessible for keyboard/screen reader users
         *
         * Issue: Custom pages may contain <ods-chart> elements directly in the HTML
         * (not via the analyze tab). These charts face the same accessibility issues:
         * - Keyboard users cannot navigate data points
         * - Screen reader users have no text alternative
         * - Users who need to copy/paste data cannot access it
         *
         * Solution: Find <ods-chart> elements outside the analyze tab, capture their
         * data via API interception, and add accessible table alternatives.
         * Labels are extracted from the Highcharts legend.
         *
         * NOTE: This is separate from fixAnalyzeChartAccessibility to avoid conflicts.
         */
        fixCustomPageChartAccessibility: function() {
            // Skip if we're on a standard dataset page with analyze tab
            // The analyze tab fix handles those cases
            const isAnalyzePage = window.location.pathname.includes('/explore/dataset/') &&
                                  !window.location.pathname.includes('/custom/');
            if (isAnalyzePage) {
                return;
            }

            // Month names for formatting
            const monthNames = {
                'nl': ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
                       'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
                'fr': ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                       'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
                'en': ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']
            };

            const lang = (document.documentElement.lang || 'nl').toLowerCase().split('-')[0];
            const months = monthNames[lang] || monthNames['nl'];

            // Labels for UI elements
            const labels = {
                'nl': {
                    chartView: 'Grafiek',
                    tableView: 'Tabel',
                    viewAs: 'Weergave kiezen',
                    tableCaption: 'Grafiekdata in tabelvorm',
                    period: 'Periode',
                    category: 'Categorie',
                    value: 'Waarde',
                    noData: 'Geen data beschikbaar'
                },
                'fr': {
                    chartView: 'Graphique',
                    tableView: 'Tableau',
                    viewAs: 'Choisir l\'affichage',
                    tableCaption: 'Données du graphique sous forme de tableau',
                    period: 'Période',
                    category: 'Catégorie',
                    value: 'Valeur',
                    noData: 'Aucune donnée disponible'
                },
                'en': {
                    chartView: 'Chart',
                    tableView: 'Table',
                    viewAs: 'Choose view',
                    tableCaption: 'Chart data in table format',
                    period: 'Period',
                    category: 'Category',
                    value: 'Value',
                    noData: 'No data available'
                }
            };
            const t = labels[lang] || labels['nl'];

            // Store captured chart data per chart element
            const chartDataMap = new WeakMap();

            function formatXValue(x) {
                if (typeof x === 'object' && x !== null) {
                    if ('year' in x && 'month' in x && Object.keys(x).length === 2) {
                        return months[x.month - 1] + ' ' + x.year;
                    }
                    if ('year' in x && Object.keys(x).length === 1) {
                        return String(x.year);
                    }
                    // Complex grouped data
                    const categoryParts = [];
                    let timePart = null;
                    for (const [key, value] of Object.entries(x)) {
                        if (typeof value === 'object' && value !== null) {
                            if ('year' in value && 'month' in value) {
                                timePart = months[value.month - 1] + ' ' + value.year;
                            } else if ('year' in value) {
                                timePart = String(value.year);
                            } else if ('month' in value) {
                                timePart = months[value.month - 1];
                            }
                        } else if (value !== null && value !== undefined && value !== '') {
                            categoryParts.push(String(value));
                        }
                    }
                    const allParts = [...categoryParts];
                    if (timePart) allParts.push(timePart);
                    if (allParts.length > 0) return allParts.join(' - ');
                    return JSON.stringify(x);
                }
                return String(x);
            }

            function getSeriesKeys(data) {
                if (!data || data.length === 0) return [];
                const firstRow = data[0];
                return Object.keys(firstRow).filter(key => key !== 'x' && key.startsWith('serie'));
            }

            // Function name translations
            const funcTranslations = {
                'nl': { SUM: 'Som', AVG: 'Gemiddelde', COUNT: 'Aantal', MIN: 'Minimum', MAX: 'Maximum', STDDEV: 'Standaardafwijking' },
                'fr': { SUM: 'Somme', AVG: 'Moyenne', COUNT: 'Nombre', MIN: 'Minimum', MAX: 'Maximum', STDDEV: 'Écart-type' },
                'en': { SUM: 'Sum', AVG: 'Average', COUNT: 'Count', MIN: 'Minimum', MAX: 'Maximum', STDDEV: 'Std Dev' }
            };
            const funcTrans = funcTranslations[lang] || funcTranslations['nl'];

            function getSeriesLabelsFromHighcharts(chartElement) {
                const labels = {};
                try {
                    // Find the Highcharts container within this chart element
                    const highchartsContainer = chartElement.querySelector('.highcharts-container');

                    // Try div-based legend first (most common for custom charts)
                    let legendTexts = [];
                    if (highchartsContainer) {
                        const divLegendItems = highchartsContainer.querySelectorAll('div.highcharts-legend-item > span');
                        if (divLegendItems.length > 0) {
                            legendTexts = Array.from(divLegendItems)
                                .map(el => el.textContent.trim())
                                .filter(text => text.length > 0);
                        }

                        // Fall back to SVG-based legend
                        if (legendTexts.length === 0) {
                            const svgLegendItems = highchartsContainer.querySelectorAll('.highcharts-legend-item text tspan, .highcharts-legend-item text');
                            if (svgLegendItems.length > 0) {
                                legendTexts = Array.from(svgLegendItems)
                                    .map(el => el.textContent.trim())
                                    .filter(text => text.length > 0);
                            }
                        }
                    }

                    // Map to series keys (serie1-1, serie1-2, etc.)
                    if (legendTexts.length > 0) {
                        legendTexts.forEach((text, index) => {
                            labels['serie1-' + (index + 1)] = text;
                        });
                    } else {
                        // Fall back to extracting from ods-chart-serie HTML attributes
                        // when display-legend="false" or legend not rendered
                        const serieElements = chartElement.querySelectorAll('ods-chart-serie');
                        if (serieElements.length > 0) {
                            serieElements.forEach((serie, index) => {
                                const funcY = serie.getAttribute('function-y') || 'SUM';
                                const exprY = serie.getAttribute('expression-y') || '';
                                const funcLabel = funcTrans[funcY.toUpperCase()] || funcY;
                                // Format field name: replace underscores with spaces, capitalize
                                const fieldLabel = exprY.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                labels['serie1-' + (index + 1)] = funcLabel + ' ' + fieldLabel;
                            });
                        }
                    }
                } catch (e) {
                }
                return labels;
            }

            function createDataTable(data, chartElement) {
                const seriesKeys = getSeriesKeys(data);
                const seriesLabels = getSeriesLabelsFromHighcharts(chartElement);
                const isTimeSeries = data[0]?.x && typeof data[0].x === 'object' && 'year' in data[0].x;

                // Fallback labels if Highcharts didn't provide them
                seriesKeys.forEach((key, index) => {
                    if (!seriesLabels[key]) {
                        seriesLabels[key] = 'Serie ' + (index + 1);
                    }
                });

                const table = document.createElement('table');
                table.className = 'a11y-chart-data-table';
                table.style.cssText = `
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 1rem;
                    font-size: 0.9rem;
                `;

                const caption = document.createElement('caption');
                caption.textContent = t.tableCaption;
                caption.style.cssText = 'font-weight: bold; padding: 0.5rem; text-align: left;';
                table.appendChild(caption);

                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');

                const thX = document.createElement('th');
                thX.scope = 'col';
                thX.textContent = isTimeSeries ? t.period : t.category;
                thX.style.cssText = 'border: 1px solid #ccc; padding: 0.5rem; background: #f5f5f5; text-align: left;';
                headerRow.appendChild(thX);

                seriesKeys.forEach(serieKey => {
                    const th = document.createElement('th');
                    th.scope = 'col';
                    th.textContent = seriesLabels[serieKey] || t.value;
                    th.style.cssText = 'border: 1px solid #ccc; padding: 0.5rem; background: #f5f5f5; text-align: right;';
                    headerRow.appendChild(th);
                });

                thead.appendChild(headerRow);
                table.appendChild(thead);

                const tbody = document.createElement('tbody');
                data.forEach((row, index) => {
                    const tr = document.createElement('tr');
                    tr.style.cssText = index % 2 === 0 ? 'background: #fff;' : 'background: #fafafa;';

                    const th = document.createElement('th');
                    th.scope = 'row';
                    th.textContent = formatXValue(row.x);
                    th.style.cssText = 'border: 1px solid #ccc; padding: 0.5rem; text-align: left; font-weight: normal;';
                    tr.appendChild(th);

                    seriesKeys.forEach(serieKey => {
                        const td = document.createElement('td');
                        const value = row[serieKey];
                        td.textContent = value !== null && value !== undefined ?
                            Number(value).toLocaleString(lang) : '-';
                        td.style.cssText = 'border: 1px solid #ccc; padding: 0.5rem; text-align: right;';
                        tr.appendChild(td);
                    });

                    tbody.appendChild(tr);
                });

                table.appendChild(tbody);
                return table;
            }

            function createViewSwitcher(chartElement, uniqueId) {
                const container = document.createElement('div');
                container.className = 'a11y-custom-chart-view-switcher';
                container.dataset.chartId = uniqueId;
                container.style.cssText = 'margin-top: 1rem;';

                const tablist = document.createElement('div');
                tablist.setAttribute('role', 'tablist');
                tablist.setAttribute('aria-label', t.viewAs);
                tablist.style.cssText = `
                    display: inline-flex;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 1rem;
                `;

                const tabStyle = `
                    padding: 0.5rem 1rem;
                    border: none;
                    background: #f5f5f5;
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: #333;
                    transition: background 0.15s, color 0.15s;
                `;
                const activeTabStyle = `
                    padding: 0.5rem 1rem;
                    border: none;
                    background: #025da4;
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: white;
                    transition: background 0.15s, color 0.15s;
                `;

                const chartTab = document.createElement('button');
                chartTab.type = 'button';
                chartTab.id = 'a11y-custom-tab-chart-' + uniqueId;
                chartTab.setAttribute('role', 'tab');
                chartTab.setAttribute('aria-selected', 'true');
                chartTab.setAttribute('aria-controls', 'a11y-custom-panel-chart-' + uniqueId);
                chartTab.setAttribute('tabindex', '0');
                chartTab.textContent = t.chartView;
                chartTab.style.cssText = activeTabStyle;

                const tableTab = document.createElement('button');
                tableTab.type = 'button';
                tableTab.id = 'a11y-custom-tab-table-' + uniqueId;
                tableTab.setAttribute('role', 'tab');
                tableTab.setAttribute('aria-selected', 'false');
                tableTab.setAttribute('aria-controls', 'a11y-custom-panel-table-' + uniqueId);
                tableTab.setAttribute('tabindex', '-1');
                tableTab.textContent = t.tableView;
                tableTab.style.cssText = tabStyle;

                tablist.appendChild(chartTab);
                tablist.appendChild(tableTab);

                const chartPanel = document.createElement('div');
                chartPanel.id = 'a11y-custom-panel-chart-' + uniqueId;
                chartPanel.setAttribute('role', 'tabpanel');
                chartPanel.setAttribute('aria-labelledby', 'a11y-custom-tab-chart-' + uniqueId);
                chartPanel.setAttribute('tabindex', '0');

                const tablePanel = document.createElement('div');
                tablePanel.id = 'a11y-custom-panel-table-' + uniqueId;
                tablePanel.setAttribute('role', 'tabpanel');
                tablePanel.setAttribute('aria-labelledby', 'a11y-custom-tab-table-' + uniqueId);
                tablePanel.setAttribute('tabindex', '0');
                tablePanel.style.cssText = 'display: none; max-height: 500px; overflow: auto;';

                function activateTab(selectedTab) {
                    const tabs = [chartTab, tableTab];
                    const panels = [chartPanel, tablePanel];

                    tabs.forEach((tab, index) => {
                        const isSelected = tab === selectedTab;
                        tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                        tab.setAttribute('tabindex', isSelected ? '0' : '-1');
                        tab.style.cssText = isSelected ? activeTabStyle : tabStyle;
                        panels[index].style.display = isSelected ? 'block' : 'none';
                    });

                    // Render table data when table tab is selected
                    if (selectedTab === tableTab) {
                        const data = chartDataMap.get(chartElement);
                        if (data && !tablePanel.querySelector('table')) {
                            const table = createDataTable(data, chartElement);
                            tablePanel.appendChild(table);
                        }
                    }

                    selectedTab.focus();
                }

                chartTab.addEventListener('click', () => activateTab(chartTab));
                tableTab.addEventListener('click', () => activateTab(tableTab));

                [chartTab, tableTab].forEach(tab => {
                    tab.addEventListener('keydown', (e) => {
                        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                            e.preventDefault();
                            activateTab(tab === chartTab ? tableTab : chartTab);
                        }
                    });
                });

                [chartTab, tableTab].forEach(tab => {
                    tab.addEventListener('mouseenter', function() {
                        if (this.getAttribute('aria-selected') !== 'true') {
                            this.style.background = '#e0e0e0';
                        }
                    });
                    tab.addEventListener('mouseleave', function() {
                        if (this.getAttribute('aria-selected') !== 'true') {
                            this.style.background = '#f5f5f5';
                        }
                    });
                });

                container.appendChild(tablist);
                container.appendChild(chartPanel);
                container.appendChild(tablePanel);

                return { container, chartPanel, tablePanel };
            }

            // Track pending data requests to match with charts
            const pendingChartData = [];

            // Register interceptor for custom page chart data
            onApiResponse(
                function(url) {
                    return url.includes('/api/explore/v2.1/catalog/datasets/') && url.includes('/analyze');
                },
                function(data) {
                    if (Array.isArray(data) && data.length > 0) {
                        pendingChartData.push(data);
                        setTimeout(function() { assignDataToCharts(); }, 500);
                    }
                }
            );

            function assignDataToCharts() {
                // Find .odswidget-charts containers that have ods-chart-serie descendants
                // This distinguishes custom-defined charts (with series in HTML) from
                // the analyze tab's dynamically configured chart (no series in HTML)
                // The structure is: .odswidget-charts > .ods-chart + ng-transclude > ods-chart-query > ods-chart-serie
                const allWidgets = document.querySelectorAll('.odswidget-charts');

                const customCharts = Array.from(allWidgets).filter(widget => {
                    // Check if this widget has ods-chart-serie descendants defined in HTML
                    const hasSeries = widget.querySelector('ods-chart-serie') !== null;
                    // Skip if there are ods-chart-controls (analyze tab widget)
                    const hasControls = widget.closest('.ods-analyze') !== null ||
                                        widget.parentElement?.querySelector('.ods-chart-controls') !== null;
                    return hasSeries && !hasControls;
                });

                customCharts.forEach((widget, index) => {
                    // Skip if already processed
                    if (widget.dataset.a11yCustomChartFixed) return;

                    // Find the .ods-chart div inside the widget (contains Highcharts)
                    const chartDiv = widget.querySelector('.ods-chart');
                    if (!chartDiv) return;

                    // Wait for Highcharts to render
                    const highchartsContainer = chartDiv.querySelector('.highcharts-container');
                    if (!highchartsContainer) return;

                    // Try to get data for this chart
                    if (pendingChartData.length > 0) {
                        const data = pendingChartData.shift();
                        chartDataMap.set(widget, data);

                        // Create view switcher
                        const uniqueId = 'custom-' + index + '-' + Date.now();
                        const { container, chartPanel } = createViewSwitcher(widget, uniqueId);

                        // Find the widget's parent and insert the view switcher
                        const widgetParent = widget.parentNode;

                        // Move the widget into the chart panel
                        chartPanel.appendChild(widget);

                        // Insert the view switcher where the widget was
                        widgetParent.appendChild(container);

                        widget.dataset.a11yCustomChartFixed = 'true';
                    }
                });
            }

            // Watch for charts to appear (Angular dynamic rendering)
            const observer = new MutationObserver(mutations => {
                let hasNewCharts = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.classList?.contains('odswidget-charts') ||
                                node.querySelector?.('.odswidget-charts')) {
                                hasNewCharts = true;
                            }
                            // Also check for Highcharts container appearing
                            if (node.classList?.contains('highcharts-container') ||
                                node.querySelector?.('.highcharts-container')) {
                                hasNewCharts = true;
                            }
                        }
                    });
                });
                if (hasNewCharts) {
                    setTimeout(() => assignDataToCharts(), 1000);
                }
            });

            utils.ready(function() {
                observer.observe(document.body, { childList: true, subtree: true });
                // Initial check after page settles
                setTimeout(() => assignDataToCharts(), 2000);
            });

        },

        /**
         * CSS visual fixes for accessibility
         *
         * Issue #13: Links in content areas lack underline, making them
         * indistinguishable from regular text for users who cannot perceive color.
         *
         * Issue #16: Filter count and filter section elements need proper
         * background color styling.
         *
         * Issue #17: Image content containers need better background contrast.
         *
         * Solution: Inject CSS to apply these visual improvements.
         */
        fixElevenWaysCSS: function() {
            const style = document.createElement('style');
            style.id = 'a11y-eleven-ways-css';
            style.textContent = `
                /* Issue #13: Links in content need underline for non-color identification */
                .ods-tabs__pane a, .ods-box a, .page-layout p a {
                    text-decoration: underline;
                }

                .ods-tabs__pane a:hover, .ods-box a:hover, .page-layout p a:hover {
                    text-decoration: none;
                }

                /* Exceptions: navigation/button elements should not have underlines */
                .ods-tabs__tab.ods-tabs__tab--simple-nav,
                .dataset-button a,
                .ods-tabs__pane .ods-button,
                [ods-facet-results-facet-name="theme"] .color-card {
                    text-decoration: none;
                }

                /* Reset default button styling for tab buttons replacing <a> tags */
                button.ods-tabs__tab {
                    background: none;
                    border: none;
                    padding: 0;
                    margin: 0;
                    font: inherit;
                    color: inherit;
                    cursor: pointer;
                }

                /* Dataset button styling */
                .dataset-button {
                    background-color: #025da4 !important;
                }

                .dataset-button:hover {
                    background-color: #01243f !important;
                }

                /* Issue #17: Image content container background */
                .img-content {
                    background-color: rgba(255, 255, 255, 0.5);
                    border-radius: 4px;
                }

                /* Issue #16: Filter section background colors */
                .ods-filters__count,
                .ods-filters__export-catalog-title,
                .ods-filters__filters,
                .ods-filters__filters-summary {
                    background-color: #025da4;
                }

                .odswidget-facet__category--refined, .odswidget-facet__category:hover {
                    color: #025da4;
                    border-color: #025da4;
                    border-left-color: #025da4;
                    text-decoration: underline;
                }

                /* Back office link: #025da4 on #02bcf0 is ~3:1, needs 4.5:1 */
                .ods-front-header__management-menu-item-link--backoffice {
                    color: #01243f;
                }

                /* Footer active language: #02bcf0 on #025da4 is ~3:1, needs 4.5:1 */
                .ods-front-footer__link--active {
                    color: #fff;
                }

                /* KPI title: #02bcf0 on white is ~2.2:1, needs 3:1 for large text */
                .ods-box .kpi-title, .kpi-card .kpi-title {
                    color: #025da4;
                    font-weight: 700;
                }

                /* Inline-styled links: white on #02BCF0 is ~2.2:1, needs 4.5:1 */
                a[style*="color:white"][style*="02BCF0"] {
                    background-color: #025da4 !important;
                }

                /* Welcome card: white on #02bcf0 is ~2.2:1, needs 4.5:1 */
                .home-header .welcome-card {
                    background-color: #025da4;
                }

                /* Tab labels: rgba(51,51,51,.6) on white is ~3.2:1, needs 4.5:1 */
                .ods-tabs__tab.ods-tabs__tab--simple-nav {
                    color: #333;
                }

                /* Sort label: #888 on white is ~3.5:1, needs 4.5:1 */
                .ods-catalog-sort-selected-label {
                    color: #767676;
                }

                /* Inline #00bcf0 on #025DA4 is ~3:1, needs 4.5:1 */
                [style*="025DA4"] [style*="00bcf0"] {
                    color: #99e5ff !important;
                }
                [style*="025DA4"] a[style*="00bcf0"] {
                    text-decoration: underline !important;
                }
                [style*="025DA4"] a[style*="00bcf0"]:hover {
                    text-decoration: none !important;
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * Fix: Remove redundant aria-label from theme picto images
         *
         * Issue: Theme picto images on the home page have both alt="" (decorative)
         * and aria-label="Theme of this dataset: X". The aria-label is redundant
         * because the theme name is already visible as text within the parent link.
         * This causes screen readers to announce the theme twice.
         *
         * Solution: Remove the aria-label attribute from these decorative images.
         */
        fixThemePictoAriaLabel: function() {
            function applyFix(img) {
                if (img.dataset.a11yAriaLabelFixed) return;

                // Only remove aria-label if the image is decorative (empty alt)
                if (img.hasAttribute('aria-label') && img.getAttribute('alt') === '') {
                    img.removeAttribute('aria-label');
                    img.dataset.a11yAriaLabelFixed = 'true';
                }
            }

            // Selector for theme picto images
            const selector = '.odswidget-theme-picto__container img';

            // Fix existing elements
            utils.selectAll(selector).forEach(applyFix);

            // Watch for dynamically added elements (Angular)
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selector)) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll(selector).forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix export link aria-labels
         *
         * Issue: Export links have aria-label "Dataset export (CSV)" but visible
         * text is "Volledige dataset" (which is aria-hidden). The aria-label
         * doesn't describe the action (download).
         *
         * Solution: Update aria-label to "Download volledige dataset als [format]"
         * with support for NL and FR languages.
         */
        fixExportLinkAriaLabels: function() {
            const translations = {
                nl: { download: 'Download', as: 'als', fullDataset: 'volledige dataset' },
                fr: { download: 'Télécharger', as: 'en', fullDataset: 'jeu de données complet' }
            };

            function getLanguage() {
                const lang = (document.documentElement.lang || 'nl').toLowerCase().split('-')[0];
                return lang.startsWith('fr') ? 'fr' : 'nl';
            }

            function applyFix(link) {
                if (link.dataset.a11yExportFixed) return;

                const container = link.closest('.ods-dataset-export-link');
                if (!container) return;

                const formatName = container.querySelector('.ods-dataset-export-link__format-name');
                if (!formatName) return;

                const format = formatName.textContent.trim();
                const lang = getLanguage();
                const t = translations[lang];

                // Build descriptive aria-label: "Download [full dataset] as [format]"
                link.setAttribute('aria-label', `${t.download} ${t.fullDataset} ${t.as} ${format}`);
                link.dataset.a11yExportFixed = 'true';

            }

            // Fix existing links
            utils.selectAll('.ods-dataset-export-link__link').forEach(applyFix);

            // Watch for dynamically added links
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches('.ods-dataset-export-link__link')) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll('.ods-dataset-export-link__link').forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix bilingual content language tags on reuses page
         *
         * Issue: Reuse descriptions contain bilingual content (FR/NL) separated
         * by "----" but no lang attributes, so screen readers use the page
         * language for all content.
         *
         * Solution: Detect the separator and wrap each language section with
         * appropriate lang attribute.
         */
        fixBilingualContentLang: function() {
            // Language-specific words (excluding words that overlap between languages)
            const langPatterns = {
                fr: ['le', 'la', 'les', 'des', 'du', 'une', 'est', 'sont', 'dans', 'pour', 'qui', 'que', 'sur', 'avec', 'cette', 'ces', 'nous', 'vous', 'leur', 'mais', 'aussi', 'comme', 'peut', 'ont', 'ses', 'aux'],
                nl: ['het', 'een', 'van', 'zijn', 'worden', 'deze', 'dit', 'naar', 'ook', 'aan', 'bij', 'tot', 'werd', 'niet', 'meer', 'wel', 'nog', 'daar', 'hier', 'omdat', 'maar', 'veel', 'hun', 'zij', 'wij'],
                en: ['the', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these', 'those', 'with', 'from', 'they', 'their', 'which', 'who', 'what', 'when', 'where', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once']
            };

            function detectLanguage(text) {
                const words = text.toLowerCase().split(/\s+/);
                const scores = { fr: 0, nl: 0, en: 0 };

                words.forEach(word => {
                    Object.keys(langPatterns).forEach(lang => {
                        if (langPatterns[lang].includes(word)) scores[lang]++;
                    });
                });

                // Find highest score
                const maxScore = Math.max(scores.fr, scores.nl, scores.en);

                // Only return if confident (score >= 2 and clearly higher than others)
                if (maxScore >= 2) {
                    const secondHighest = Object.values(scores).sort((a, b) => b - a)[1];
                    if (maxScore > secondHighest) {
                        if (scores.fr === maxScore) return 'fr';
                        if (scores.nl === maxScore) return 'nl';
                        if (scores.en === maxScore) return 'en';
                    }
                }
                return null;
            }

            function applyFixToDescription(element) {
                if (element.dataset.a11yLangFixed) return;

                const html = element.innerHTML;
                // Match ---- separator (with optional <br> tags around it)
                const separator = /(<br\s*\/?>)?\s*-{3,}\s*(<br\s*\/?>)?/i;

                if (separator.test(html)) {
                    // Split by separator and wrap each part
                    const parts = html.split(separator).filter(part =>
                        part && part.trim() && !part.match(/^(<br\s*\/?>|-+|\s*)$/i)
                    );

                    if (parts.length >= 2) {
                        const lang1 = detectLanguage(parts[0]);
                        const lang2 = detectLanguage(parts[1]);

                        // Only apply if we detected both languages
                        if (lang1 && lang2) {
                            var span1 = document.createElement('span');
                            span1.setAttribute('lang', lang1);
                            var tpl1 = document.createElement('template');
                            tpl1.innerHTML = parts[0].trim();
                            span1.appendChild(tpl1.content);

                            var divider = document.createElement('span');
                            divider.setAttribute('aria-hidden', 'true');
                            divider.appendChild(document.createElement('br'));
                            divider.appendChild(document.createTextNode('----'));
                            divider.appendChild(document.createElement('br'));

                            var span2 = document.createElement('span');
                            span2.setAttribute('lang', lang2);
                            var tpl2 = document.createElement('template');
                            tpl2.innerHTML = parts[1].trim();
                            span2.appendChild(tpl2.content);

                            element.replaceChildren(span1, divider, span2);
                            element.dataset.a11yLangFixed = 'true';
                        }
                    }
                } else {
                    // No separator - detect language for the whole element
                    const detectedLang = detectLanguage(element.textContent);
                    const pageLang = document.documentElement.lang?.substring(0, 2) || 'fr';

                    if (detectedLang && detectedLang !== pageLang) {
                        element.setAttribute('lang', detectedLang);
                        element.dataset.a11yLangFixed = 'true';
                    }
                }
            }

            function applyFixToTitle(element) {
                if (element.dataset.a11yLangFixed) return;

                // Get only the direct text content (not child elements like links)
                const textNodes = Array.from(element.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());

                const titleText = textNodes.map(node => node.textContent).join('').trim();

                if (!titleText) return;

                const pageLang = document.documentElement.lang?.substring(0, 2) || 'fr';

                // Check for " - " separator pattern in titles (e.g., "French Title - Dutch Title")
                const dashSeparator = /\s+-\s+/;
                if (dashSeparator.test(titleText)) {
                    const parts = titleText.split(dashSeparator);
                    if (parts.length === 2) {
                        let lang1 = detectLanguage(parts[0]);
                        let lang2 = detectLanguage(parts[1]);

                        // If detection failed, assume FR-NL pattern based on page language
                        // These sites typically show: [page language] - [other language]
                        if (!lang1 || !lang2 || lang1 === lang2) {
                            if (pageLang === 'nl') {
                                lang1 = 'nl';
                                lang2 = 'fr';
                            } else {
                                // Default: FR first, NL second
                                lang1 = 'fr';
                                lang2 = 'nl';
                            }
                        }

                        // Find and replace the text node
                        textNodes.forEach(node => {
                            const langSpan1 = document.createElement('span');
                            langSpan1.setAttribute('lang', lang1);
                            langSpan1.textContent = parts[0].trim();
                            const langSpan2 = document.createElement('span');
                            langSpan2.setAttribute('lang', lang2);
                            langSpan2.textContent = parts[1].trim();
                            node.replaceWith(langSpan1, ' - ', langSpan2);
                        });
                        element.dataset.a11yLangFixed = 'true';
                        return;
                    }
                }

                // No separator or couldn't split - check if whole title is different language
                const detectedLang = detectLanguage(titleText);
                if (detectedLang && detectedLang !== pageLang) {
                    // Wrap text nodes with lang span
                    textNodes.forEach(node => {
                        const span = document.createElement('span');
                        span.setAttribute('lang', detectedLang);
                        span.textContent = node.textContent;
                        node.replaceWith(span);
                    });
                    element.dataset.a11yLangFixed = 'true';
                }
            }

            function fixAll() {
                utils.selectAll('.odswidget-reuses__reuse-description').forEach(applyFixToDescription);
                utils.selectAll('.odswidget-reuses__reuse-title').forEach(applyFixToTitle);
            }

            // Fix existing elements
            fixAll();

            // Watch for dynamically added elements
            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.querySelector &&
                                (node.querySelector('.odswidget-reuses__reuse-description') ||
                                 node.querySelector('.odswidget-reuses__reuse-title'))) {
                                needsFix = true;
                            }
                        }
                    });
                });
                if (needsFix) fixAll();
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix: Facet "Plus" button reveals items above itself
         *
         * Issue: When a screen reader user clicks the "Plus" expand button in
         * a facet filter list, new items appear above the button in DOM order.
         * The user has to navigate backwards to find them, which is confusing.
         * Also, the button has no aria-expanded state.
         *
         * Solution: Move the initially hidden items to after the expansion
         * control in the DOM, so they appear below the button when revealed.
         * Add aria-expanded to the Plus/Moins links.
         */
        fixFacetExpandOrder: function() {
            function applyFix(expansionControl) {
                if (expansionControl.dataset.a11yExpandFixed) return;

                const list = expansionControl.closest('.odswidget-facet__category-list');
                if (!list) return;

                // Find hidden items (inner div has ng-hide) and move them after the expansion control
                // Use flexbox + order so the expansion control stays first in DOM (tab order)
                // but visually appears after all the items
                list.style.display = 'flex';
                list.style.flexDirection = 'column';
                expansionControl.style.order = '999';

                const allItems = utils.selectAll('.odswidget-facet__category-container', list);
                let insertAfter = expansionControl;
                allItems.forEach(li => {
                    const innerDiv = li.querySelector('.odswidget-facet-category');
                    if (innerDiv && innerDiv.classList.contains('ng-hide')) {
                        // Move this <li> to after the last inserted item (preserves A->Z order)
                        insertAfter.after(li);
                        insertAfter = li;
                    }
                });

                // Add aria-expanded to both links
                const plusLink = expansionControl.querySelector('a[ng-hide="expanded"]');
                const moinsLink = expansionControl.querySelector('a[ng-show="expanded"]');

                if (plusLink) plusLink.setAttribute('aria-expanded', 'false');
                if (moinsLink) moinsLink.setAttribute('aria-expanded', 'true');

                // Watch for toggle (ng-hide swaps between the two links)
                const linkObserver = new MutationObserver(function() {
                    if (plusLink) {
                        plusLink.setAttribute('aria-expanded',
                            plusLink.classList.contains('ng-hide') ? 'true' : 'false');
                    }
                    if (moinsLink) {
                        moinsLink.setAttribute('aria-expanded',
                            moinsLink.classList.contains('ng-hide') ? 'false' : 'true');
                    }
                });

                if (plusLink) linkObserver.observe(plusLink, { attributes: true, attributeFilter: ['class'] });
                if (moinsLink) linkObserver.observe(moinsLink, { attributes: true, attributeFilter: ['class'] });

                expansionControl.dataset.a11yExpandFixed = 'true';
            }

            const selector = '.odswidget-facet__expansion-control';

            // Fix existing elements
            utils.selectAll(selector).forEach(applyFix);

            // Watch for dynamically added elements
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selector)) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll(selector).forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix: Results section missing heading and incorrect heading level
         *
         * Issue: The results list has no heading, so screen reader users cannot
         * quickly navigate to the results section. Also, individual result
         * titles use h2 but should be h3 under the section heading.
         *
         * Solution: Insert an h2 "Resultaten" heading before the results list
         * (in the correct language) and convert result card h2 titles to h3.
         */
        fixResultsHeading: function() {
            const lang = (document.documentElement.lang || 'nl').toLowerCase().split('-')[0];
            const headingText = {
                'nl': 'Resultaten',
                'fr': 'Résultats',
                'en': 'Results'
            };

            function addSectionHeading(resultList) {
                if (resultList.dataset.a11yResultsHeadingFixed) return;

                const h2 = document.createElement('h2');
                h2.className = 'a11y-results-heading';
                h2.textContent = headingText[lang] || headingText['nl'];
                h2.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;white-space:nowrap;';

                resultList.parentNode.insertBefore(h2, resultList);

                resultList.dataset.a11yResultsHeadingFixed = 'true';
            }

            function demoteCardHeadings(root) {
                utils.selectAll('h2.ods-catalog-card__title', root).forEach(h2 => {
                    const h3 = document.createElement('h3');
                    Array.from(h2.attributes).forEach(attr => {
                        h3.setAttribute(attr.name, attr.value);
                    });
                    h3.className = h2.className.replace('ods-catalog-card__title', 'ods-catalog-card__title a11y-demoted-heading');
                    while (h2.firstChild) h3.appendChild(h2.firstChild);
                    h2.replaceWith(h3);
                });
            }

            // Fix existing elements
            utils.selectAll('.ods-result-list').forEach(addSectionHeading);
            demoteCardHeadings(document);

            // Watch for dynamically added elements
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches('.ods-result-list')) {
                                addSectionHeading(node);
                            }
                            if (node.querySelector) {
                                node.querySelectorAll('.ods-result-list').forEach(addSectionHeading);
                            }
                            // Demote any new h2 card titles
                            if (node.matches && node.matches('h2.ods-catalog-card__title')) {
                                demoteCardHeadings(node.parentNode);
                            }
                            if (node.querySelectorAll) {
                                demoteCardHeadings(node);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix: Dataset page h1 appears after filters in DOM order
         *
         * Issue: On dataset detail pages, the filters sidebar comes before
         * the h1 in DOM order. Screen reader users hear the filters first
         * and have no page heading context.
         *
         * Solution: Insert a visually hidden h1 (with the same text) before
         * the filters, and hide the original h1 from assistive technology
         * with aria-hidden to avoid duplication.
         */
        fixDatasetPageH1Order: function() {
            function applyFix() {
                const viz = document.querySelector('.ods-dataset-visualization__header h1');
                if (!viz || viz.dataset.a11yH1OrderFixed) return;

                const filtersSummary = document.querySelector('.ods-filters-summary');
                if (!filtersSummary) return;

                // Create visually hidden h1 with the same text
                const hiddenH1 = document.createElement('h1');
                hiddenH1.className = 'a11y-sr-only-h1';
                hiddenH1.textContent = viz.textContent.trim();
                hiddenH1.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;white-space:nowrap;';

                // Insert before the filters
                filtersSummary.parentNode.insertBefore(hiddenH1, filtersSummary);

                // Hide original h1 from screen readers
                viz.setAttribute('aria-hidden', 'true');

                viz.dataset.a11yH1OrderFixed = 'true';
            }

            // Fix existing elements
            applyFix();

            // Watch for dynamically added elements (Angular)
            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.querySelector &&
                                (node.querySelector('.ods-dataset-visualization__header h1') ||
                                 node.querySelector('.ods-filters-summary'))) {
                                needsFix = true;
                            }
                        }
                    });
                });
                if (needsFix) applyFix();
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix: Footer links not in a list
         *
         * Issue: The footer links (terms, privacy, licence, accessibility,
         * cookies) are loose <a> elements, not wrapped in a semantic list.
         * Screen readers cannot convey the number of items or allow list
         * navigation.
         *
         * Solution: Collect the loose links and wrap them in a <ul>.
         */
        fixFooterLinksList: function() {
            function applyFix(footer) {
                if (footer.dataset.a11yFooterListFixed) return;

                // Remove &nbsp; text nodes
                footer.childNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        node.textContent = node.textContent.replace(/\u00A0/g, '');
                    }
                });

                // Collect direct child links (not those inside the language <ul> or logo)
                const looseLinks = [];
                footer.childNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Skip the logo, the language list, and non-link elements
                        if (node.tagName === 'A' && !node.classList.contains('ods-front-footer__ods-logo')) {
                            looseLinks.push(node);
                        }
                        // Also catch links inside <ods-manage-cookies-preferences>
                        if (node.tagName === 'ODS-MANAGE-COOKIES-PREFERENCES') {
                            const cookieLink = node.querySelector('a');
                            if (cookieLink) looseLinks.push(cookieLink);
                        }
                    }
                });

                if (!looseLinks.length) return;

                const ul = document.createElement('ul');
                ul.className = 'a11y-footer-links';
                ul.style.cssText = 'list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;gap:0;';

                // Insert the list before the first loose link
                looseLinks[0].parentNode.insertBefore(ul, looseLinks[0]);

                looseLinks.forEach(link => {
                    const li = document.createElement('li');
                    li.style.cssText = 'display:inline;';
                    li.appendChild(link);
                    ul.appendChild(li);
                });

                footer.dataset.a11yFooterListFixed = 'true';
            }

            // Fix existing elements
            utils.selectAll('.ods-front-footer').forEach(applyFix);

            // Watch for dynamically added footer
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches('.ods-front-footer')) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll('.ods-front-footer').forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Fix: Copy to clipboard button has no accessible name
         *
         * Issue: The copy-to-clipboard button only contains an icon
         * (<i class="fa fa-clipboard">) and has no text content or aria-label,
         * so screen readers announce it as an unlabelled button.
         *
         * Solution: Add an aria-label with translated text.
         */
        fixCopyButtonLabel: function() {
            var lang = (document.documentElement.lang || 'en').substring(0, 2);
            var label = { nl: 'Kopieer naar klembord', fr: 'Copier dans le presse-papiers', en: 'Copy to clipboard' }[lang] || 'Copy to clipboard';
            var selector = 'button.ods-form__addon .fa-clipboard';

            function applyFix(icon) {
                var button = icon.closest('button');
                if (!button || button.dataset.a11yCopyFixed) return;
                button.setAttribute('aria-label', label);
                button.dataset.a11yCopyFixed = 'true';
            }

            utils.selectAll(selector).forEach(applyFix);

            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selector)) applyFix(node);
                            if (node.querySelectorAll) node.querySelectorAll(selector).forEach(applyFix);
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        },

        /**
         * Fix: Logout link has no accessible name
         *
         * Issue: The logout link only contains an SVG icon and has no text
         * content or aria-label, so screen readers cannot convey its purpose.
         *
         * Solution: Add an aria-label with translated text.
         */
        fixLogoutLinkLabel: function() {
            var lang = (document.documentElement.lang || 'en').substring(0, 2);
            var label = { nl: 'Afmelden', fr: 'Se déconnecter', en: 'Log out' }[lang] || 'Log out';
            var selector = 'a[href="/logout"]';

            function applyFix(link) {
                if (link.dataset.a11yLogoutFixed) return;
                link.setAttribute('aria-label', label);
                link.dataset.a11yLogoutFixed = 'true';
            }

            utils.selectAll(selector).forEach(applyFix);

            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selector)) applyFix(node);
                            if (node.querySelectorAll) node.querySelectorAll(selector).forEach(applyFix);
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        },

        /**
         * Fix: Embed controls appear after the URL input
         *
         * Issue: The embed panel shows the iframe URL and copy button first,
         * followed by size and option controls. Screen reader users encounter
         * the URL before the controls that modify it.
         *
         * Solution: Move the URL input + copy button after the size and
         * misc option controls so users configure before copying.
         */
        /**
         * Fix: Embed/share textarea missing label
         *
         * Issue: The textarea in the embed/share widget has no associated label,
         * making it inaccessible to screen readers.
         *
         * Solution: Add aria-label based on the copy button's context.
         */
        fixEmbedTextareaLabel: function() {
            var selector = '.ods-form__addon-wrapper--fluid textarea';

            function applyFix(textarea) {
                if (textarea.dataset.a11yLabelFixed) return;
                if (textarea.getAttribute('aria-label')) return;

                var lang = (document.documentElement.lang || 'en').substring(0, 2);
                var label = { nl: 'Code om te kopiëren', fr: 'Code à copier', en: 'Code to copy' }[lang] || 'Code to copy';

                textarea.setAttribute('aria-label', label);
                textarea.dataset.a11yLabelFixed = 'true';
            }

            utils.selectAll(selector).forEach(applyFix);

            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selector)) applyFix(node);
                            if (node.querySelectorAll) node.querySelectorAll(selector).forEach(applyFix);
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        },

        fixEmbedControlOrder: function() {
            var selector = '.ods-form__addon-wrapper--fluid';

            function applyFix(urlWrapper) {
                var parent = urlWrapper.parentNode;
                if (!parent || parent.dataset.a11yEmbedOrderFixed) return;

                var miscOptions = parent.querySelector('.ods-embed-control__misc-options');
                if (!miscOptions) return;

                // Move URL input + copy button after the last control section
                parent.appendChild(urlWrapper);

                parent.dataset.a11yEmbedOrderFixed = 'true';
            }

            utils.selectAll(selector).forEach(applyFix);

            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(selector)) applyFix(node);
                            if (node.querySelectorAll) node.querySelectorAll(selector).forEach(applyFix);
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        },

        /**
         * Fix: Remove title attributes from elements
         *
         * Issue: The website has title attributes on many elements throughout
         * the page. Screen readers announce these alongside other accessible
         * names, creating redundant and confusing output.
         *
         * Solution: Remove title attributes from all elements. The title
         * attribute is excluded on <iframe> and <svg> where it serves as
         * the accessible name, and on <abbr> where it provides the expansion.
         */
        removeTitleAttributes: function() {
            const keepTitleSelectors = 'iframe, svg, abbr';

            function stripTitles(root) {
                const elements = root.querySelectorAll('[title]');
                elements.forEach(el => {
                    if (el.matches(keepTitleSelectors)) return;
                    el.removeAttribute('title');
                });
            }

            // Strip from existing DOM
            stripTitles(document);

            // Watch for dynamically added elements with title attributes
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    // Check newly added nodes
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.hasAttribute && node.hasAttribute('title') &&
                                !(node.matches(keepTitleSelectors))) {
                                node.removeAttribute('title');
                            }
                            stripTitles(node);
                        }
                    });
                    // Check attribute changes (Angular may set title dynamically)
                    if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
                        const el = mutation.target;
                        if (el.hasAttribute('title') && !(el.matches(keepTitleSelectors))) {
                            el.removeAttribute('title');
                        }
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['title']
            });

        },

        /**
         * Fix: Active filters heading structure
         *
         * Issue: The "Actieve filters" h2 contains both the heading text and
         * the "Wis alles" (Clear all) link. Having interactive elements inside
         * headings is semantically incorrect.
         *
         * Solution: Move the link outside the h2 into a wrapper div that
         * maintains the visual blue bar appearance. Mirror the ng-hide
         * visibility state from the h2 to the wrapper.
         */
        fixFiltersSummaryStructure: function() {
            function applyFix(h2) {
                if (h2.dataset.a11yStructureFixed) return;

                const link = h2.querySelector('.odswidget-clear-all-filters');
                if (!link) return;

                // Create wrapper div with the visual bar styling
                const wrapper = document.createElement('div');
                wrapper.className = 'a11y-filters-summary-wrapper';

                // Insert wrapper before the h2
                h2.parentNode.insertBefore(wrapper, h2);

                // Move h2 into wrapper
                wrapper.appendChild(h2);

                // Move link out of h2 and into wrapper
                wrapper.appendChild(link);

                // The h2 heading should always be visible as the section title.
                // Only toggle the "Wis alles" link based on active filters.
                function syncLinkVisibility() {
                    if (h2.classList.contains('ng-hide')) {
                        link.style.display = 'none';
                    } else {
                        link.style.display = '';
                    }
                }

                syncLinkVisibility();

                // Watch for ng-hide class changes on the h2 to toggle link
                const attrObserver = new MutationObserver(syncLinkVisibility);
                attrObserver.observe(h2, { attributes: true, attributeFilter: ['class'] });

                h2.dataset.a11yStructureFixed = 'true';
            }

            // Fix existing elements
            utils.selectAll('.ods-filters__filters-summary').forEach(applyFix);

            // Watch for dynamically added elements
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches('.ods-filters__filters-summary')) {
                                applyFix(node);
                            }
                            if (node.querySelectorAll) {
                                node.querySelectorAll('.ods-filters__filters-summary').forEach(applyFix);
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

        },

        /**
         * Inject CSS fixes
         *
         * Issue: Multiple CSS-based accessibility fixes need to be applied:
         * - #21: Theme picto icons have reduced opacity
         * - #13: Links not underlined (distinguishable only by color)
         * - #15: Menu items have reduced opacity
         * - #16: Filter section background color contrast
         *
         * Solution: Inject a <style> element with all CSS fixes
         */
        injectCSSFixes: function() {
            const css = `
                /* Issue #21 - Theme picto opacity */
                .odswidget-most-popular-datasets__theme-picto,
                .odswidget-last-datasets-feed__theme-picto {
                    opacity: 1;
                }

                /* Issue #13 - Links need underline for non-color distinction */
                .ods-tabs__pane a,
                .ods-box a,
                .page-layout p a {
                    text-decoration: underline;
                }

                .ods-tabs__pane a:hover,
                .ods-box a:hover,
                .page-layout p a:hover {
                    text-decoration: none;
                }

                .ods-tabs__tab.ods-tabs__tab--simple-nav,
                .dataset-button a,
                .ods-tabs__pane .ods-button {
                    text-decoration: none;
                }

                /* Reset default button styling for tab buttons replacing <a> tags */
                button.ods-tabs__tab {
                    background: none;
                    border: none;
                    padding: 0;
                    margin: 0;
                    font: inherit;
                    color: inherit;
                    cursor: pointer;
                }

                /* Issue #15 - Menu item opacity */
                .ods-front-header__menu-item-link {
                    opacity: 1;
                }

                /* Issue #16 - Filter section background color */
                .ods-filters__count,
                .ods-filters__export-catalog-title,
                .ods-filters__filters,
                .ods-filters__filters-summary {
                    background-color: #025da4;
                }

                /* Back office link: #025da4 on #02bcf0 is ~3:1, needs 4.5:1 */
                .ods-front-header__management-menu-item-link--backoffice {
                    color: #01243f;
                }

                /* Footer active language: #02bcf0 on #025da4 is ~3:1, needs 4.5:1 */
                .ods-front-footer__link--active {
                    color: #fff;
                }

                /* Inline-styled links: white on #02BCF0 is ~2.2:1, needs 4.5:1 */
                a[style*="color:white"][style*="02BCF0"] {
                    background-color: #025da4 !important;
                }

                /* Welcome card: white on #02bcf0 is ~2.2:1, needs 4.5:1 */
                .home-header .welcome-card {
                    background-color: #025da4;
                }

                /* Tab labels: rgba(51,51,51,.6) on white is ~3.2:1, needs 4.5:1 */
                .ods-tabs__tab.ods-tabs__tab--simple-nav {
                    color: #333;
                }

                /* Sort label: #888 on white is ~3.5:1, needs 4.5:1 */
                .ods-catalog-sort-selected-label {
                    color: #767676;
                }

                /* Inline #00bcf0 on #025DA4 is ~3:1, needs 4.5:1 */
                [style*="025DA4"] [style*="00bcf0"] {
                    color: #99e5ff !important;
                }
                [style*="025DA4"] a[style*="00bcf0"] {
                    text-decoration: underline !important;
                }
                [style*="025DA4"] a[style*="00bcf0"]:hover {
                    text-decoration: none !important;
                }

                /* Hamburger menu button - improve hover/focus contrast */
                .ods-responsive-menu-placeholder__toggle {
                    opacity: 1;
                }

                .ods-responsive-menu-placeholder__toggle:hover .fa-bars,
                .ods-responsive-menu-placeholder__toggle:focus-visible .fa-bars {
                    color: #fff;
                }

                .ods-responsive-menu-placeholder__toggle:focus-visible {
                    outline: 2px solid #fff;
                    outline-offset: 2px;
                    background-color: #025da4;
                }

                /* Active filters summary wrapper - takes over bar styling from h2 */
                .a11y-filters-summary-wrapper {
                    display: flex;
                    align-items: center;
                    font-size: 1.5rem;
                    background-color: #025da4;
                    color: #fff;
                    border-radius: 3px;
                    padding: .33rem .67rem;
                    position: relative;
                }

                .a11y-filters-summary-wrapper .ods-filters__filters-summary {
                    display: block !important;
                    background: none !important;
                    padding: 0;
                    margin: 0;
                    font-size: inherit;
                    color: inherit;
                    border-radius: 0;
                }

                .a11y-filters-summary-wrapper .odswidget-clear-all-filters {
                    margin-left: auto;
                    white-space: nowrap;
                }

                /* Footer links layout */
                .ods-front-footer {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: .5rem 1rem;
                    height: unset;
                }

                .a11y-footer-links {
                    justify-content: center;
                }

                @media (max-width: 768px) {
                    .ods-front-footer {
                        flex-direction: row;
                    }
                }
            `;

            const style = document.createElement('style');
            style.id = 'a11y-css-fixes';
            style.textContent = css;
            document.head.appendChild(style);

        },

        /**
         * Fix: Links missing discernible text
         *
         * Issue: Links that only contain an image with alt="" have no
         * accessible name for screen readers.
         *
         * Solution: For reuse thumbnails, use the card title. For other
         * image-only links, derive a label from the href filename.
         */
        fixImageOnlyLinks: function() {
            function hasNoAccessibleName(link) {
                if (link.getAttribute('aria-label') || link.getAttribute('aria-labelledby')) return false;
                if (link.textContent.trim()) return false;
                var img = link.querySelector('img');
                if (img && img.getAttribute('alt')) return false;
                return true;
            }

            function applyFix(link) {
                if (link.dataset.a11yFixed) return;
                if (!hasNoAccessibleName(link)) return;

                // Try reuse card title first
                var card = link.closest('.odswidget-reuses__reuse');
                if (card) {
                    var title = card.querySelector('.odswidget-reuses__reuse-title');
                    if (title) {
                        var name = title.childNodes[0] && title.childNodes[0].textContent.trim();
                        if (name) {
                            link.setAttribute('aria-label', name);
                            link.dataset.a11yFixed = 'true';
                            return;
                        }
                    }
                }

                // Derive label from href filename
                var href = link.getAttribute('href');
                if (href) {
                    var filename;
                    try {
                        filename = decodeURIComponent(href.split('/').pop().split('?')[0]);
                    } catch (e) {
                        filename = href.split('/').pop().split('?')[0];
                    }
                    filename = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
                    if (filename) {
                        link.setAttribute('aria-label', filename);
                        link.dataset.a11yFixed = 'true';
                    }
                }
            }

            function fixAll() {
                utils.selectAll('a').forEach(applyFix);
            }

            fixAll();

            const observer = new MutationObserver(mutations => {
                let needsFix = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.tagName === 'A') needsFix = true;
                            if (node.querySelector && node.querySelector('a')) needsFix = true;
                        }
                    });
                });
                if (needsFix) fixAll();
            });

            observer.observe(document.body, { childList: true, subtree: true });
        },
    };

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function init() {
        utils.ready(function() {
            fixes.injectCSSFixes();
            fixes.fixFocusOutline();
            fixes.fixFacetReadingOrder();
            fixes.fixHeadingHierarchy();
            fixes.fixMenuAriaExpanded();
            fixes.fixNavStructure();
            fixes.fixSearchInputAccessibility();
            fixes.fixSearchResultsAnnouncements();
            fixes.fixCollapsibleAriaLabel();
            fixes.fixActiveFilterRemoveButton();
            fixes.fixSortButtonKeyboard();
            fixes.fixSortRadioGroup();
            fixes.fixMobileMenuFocusability();
            fixes.fixSDGImageHeadings();
            fixes.fixDatasetCardLists();
            fixes.fixTableSortLanguage();
            fixes.fixTableHeaderAnnouncement();
            fixes.fixDatasetCountAnnouncements();
            fixes.fixTabsAriaPattern();
            fixes.fixStickyHeaderZoom();
            fixes.fixFilterCheckboxState();
            fixes.fixTableSplitHeaders();
            fixes.fixAnalyzeChartAccessibility();
            fixes.fixCustomPageChartAccessibility();
            fixes.fixElevenWaysCSS();
            fixes.fixThemePictoAriaLabel();
            fixes.fixExportLinkAriaLabels();
            fixes.fixBilingualContentLang();
            fixes.fixFacetExpandOrder();
            fixes.fixResultsHeading();
            fixes.fixDatasetPageH1Order();
            fixes.fixFooterLinksList();
            fixes.fixCopyButtonLabel();
            fixes.fixLogoutLinkLabel();
            fixes.fixEmbedTextareaLabel();
            fixes.fixEmbedControlOrder();
            fixes.removeTitleAttributes();
            fixes.fixFiltersSummaryStructure();
            fixes.fixMissingAltAttributes();
            fixes.fixImageOnlyLinks();
        });
    }

    init();

})();
