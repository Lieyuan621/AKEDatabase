AKEData has moved to www.akedata.wiki. The former domain, akedata.top, now redirects here.

# AKEData Version Changelog

### v1.2.1

Fixed an issue where some game images could incorrectly be requested from `www.akedata.wiki` after switching modules or after the Service Worker was suspended and restarted. Image paths are now synchronously rewritten to `data.akedata.wiki` when inserted into the page, covering dynamic HTML, image attributes, `srcset`, posters, and inline backgrounds.

The Service Worker now restores the data origin and shared-data revision from its registration URL and completes configuration during application startup. Its image-routing state therefore survives browser termination and restart of the worker. The site icon is also loaded directly from the data origin.

Added `LevelScriptData` enemy parsing to stat calculations in Dungeons, Contingency Contract, and Echoes of War. The site now reads enemies, levels, and spawn Buffs defined directly in scripts, as well as conditional Buffs applied through spawners. Enemy stats are therefore calculated correctly even for stages without SpawnerConfig. Contingency Contract tag-Buff preloading and stat recalculation after tag changes were also fixed.

Improved raw-value tooltips. Values without a gameplay calculation change continue to show their original value, while values modified by stat modifiers, Buffs, contract tags, or expressions now show the source value, substituted parameters, complete calculation formula, and final result. Formula tracing covers Dungeon, Contingency Contract, Echoes of War, and Enemy stats, as well as calculated descriptions for characters, weapons, equipment, and items.

### v1.2.0

Added cross-version data comparison. When `Latest` is selected, the site automatically compares it with the final Hotfix of the previous game version. New entries are always prioritized and tagged; modified-entry tags and detail Diff can be enabled with the experimental global setting, which is off by default.

Detail Diff compares only information actually rendered on the page, showing removed content in red and added content in green while ignoring hidden fields. Activities are excluded from new-entry detection. Equipment and medals are compared by their individual IDs, with containing sets or categories tagged as well. New status is shown only by tags, so card outlines continue to follow rarity colors.

### v1.2.0-pre2

Updated the complete Attribute mapping, added IDs 93–100, and synchronized `maps.json` across all 14 languages.

Enemy and dungeon modules now use the new elemental resistance parameters (IDs 94–99). Legacy resistance scalar IDs 80–85 are no longer shown in related stat cards, modifier summaries, or Buff tooltips, preventing duplicate entries and incorrect values.

### v1.2.0-pre1

Separated game data from the website code. TableCfg, Json, and image assets are now stored in Cloudflare R2 and delivered through data.akedata.wiki and the EdgeOne CDN. Added a data manifest and version selector for switching between Latest and multiple game/Hotfix versions while preserving the selection. Only TableCfg is versioned; Json and images remain shared data.

Added a configurable data request origin and an R2 synchronization script. The script can derive the game and Hotfix versions from an official Hotfix URL or accept manual input, publish TableCfg/Json/images together, update shared data only, control whether a release becomes Latest, and run a dry-run before uploading. In debug mode, Latest uses local Live Server data while pinned versions continue to use production history.

Also isolated caches by data origin and version, and moved the image-proxy Service Worker to the site root to prevent stale data after version changes, reloads, or source switches. This is the first prerelease of AKEData 1.2.0.

### v1.1.9

Added the permanent challenge feature page “Echoes of War,” with season and rotation views for stages, difficulties, rating titles, merit rewards, and official instructions. It also displays enemy waves, spawn-position maps, spawn buffs, and level-adjusted attributes, with wave switching and linked map highlighting.

### v1.1.8

Added debug mode and forced web-cache refresh; fixed character attribute nodes and development-cost parsing based on item descriptions; switched activity types to ActivityTagTable; moved rich-text styles and terms directly to TableCfg; and added sidebar home buttons to modules with landing pages.

### v1.1.6

Added site announcements and an update countdown, adapted Arcane's dual-form skill sets, improved loading messages, and removed many deprecated v2 modules.

### v1.1.5

Launched the multilingual framework, enabling language switching for the UI, modules, filters, and data mappings, with the first multilingual resources included.

### v1.1.4

Fixed version parameters for data requests, separated refresh versions for app assets and public data, and unified page cache and service worker version checks.

### v1.1.3

Added consumable effects and crafting recipes to the item module, including material-output relationships, detail styles, and corresponding v3 data adapters.

### v1.1.2

Added grouped card overview entries for characters, weapons, enemies, equipment, activities, items, dungeons, achievements, research, and other modules.

### v1.1.1

Reworked item category filters with collapsing and result counts, while improving request deduplication, IndexedDB caching, and data loading progress displays.

### v1.1.0

Launched the v3 data adapter layer based on TableCfg and Json for major query modules, with module disabling and large data file caching.

### v1.0.31

Previously added Chinese-English UI and data directory switching with related internationalization settings, but fully rolled it back and did not retain it at this stage.

### v1.0.30

Added a unified request cache wrapper and switched pages to akeFetch, reducing duplicate requests and improving loading logic when changing modules.

### v1.0.29

Moved inline scripts from the home page and modules into plugin/js, centralizing routing, settings, stat calculations, and module controllers.

### v1.0.28

Added raw-value tooltips for most module parameters, and fixed enemy HP calculations and the display of All Damage Reduction.

### v1.0.27

Added enemy-wave visualization to Contingency Contract with spawn coordinates, wave switching, and linked highlighting, while correcting merged statistics for repeated waves.

### v1.0.26

Added enemy stat inspection to Contingency Contract, calculating and displaying actual stats from level, spawn Buffs, and selected contract tags.

### v1.0.25

Preloaded and opened the Token-restricted Contingency Contract module with season search, tag conditions, conflict checks, scoring, rewards, missions, and shop displays.

### v1.0.24

Updated character v2 skill displays, corrected the order of combo and ultimate skills, and retained key parameters such as cooldowns and energy costs.

### v1.0.23

Officially opened the research module, enhanced Markdown, code highlighting, indexes, anchor navigation, and image previews, and added mechanics research articles.

### v1.0.22

Added access restrictions for modules and content using access Tokens, with Token persistence, bulk addition and clearing, plus protected content preloading.

### v1.0.21

Added Physical Anomaly Damage and Arts Anomaly Damage coefficients to the character v2 stat growth table, with precision varying by display mode.

### v1.0.20

Reordered and renamed some detailed enemy stats, moved interruption resistance and execution entries earlier, and standardized damage bonus tag wording.

### v1.0.19

Added equipment ID display, reorganized character, weapon, and equipment v2 styles, and fixed stat colors and growth value selection.

### v1.0.18

Added deep links for modules and entries, synchronized the address bar during navigation, handled hidden or missing content, and improved character stat modifier type displays.

### v1.0.17

Officially launched weapon v2 with weapon search and detailed displays for level stats, ascension materials, potentials, and skills.

### v1.0.16

Officially launched equipment v2, showing parts, primary and secondary stats, set skills, crafting recipes, precision forging guarantees, and enhancement details by set.

### v1.0.15

Officially launched dungeon v2 with series, reward, and enemy details, parsing SpawnerConfig and Buffs to show waves and modified stats.

### v1.0.14

Officially launched enemy v2 with search, mobile lists, level stats, enemy variants, stat modifiers, resistances, and stagger information.

### v1.0.13

Officially launched character v2, rebuilding stats, skills, talents, potentials, and growth information while fixing traits, images, and node displays.

### v1.0.12

Enhanced the SkillData v2 timeline with action filters, conditional branch flowcharts, node visibility, and frame-duration tooltips, while fixing some enemy values.

### v1.0.11

Added a hidden SkillData v2 debug view that presents skill logic through timelines and action nodes, with search and raw data viewing.

### v1.0.10

Continued the character v2 rebuild by creating the new character detail view, integrating complete character data, and improving field mappings and display structure.

### v1.0.9

Added the SpawnerConfig query module for browsing spawner data by scene and configuration, and adjusted the BuffData and SkillData query entries.

### v1.0.8

Added BuffData and SkillData query modules with manifest browsing, search, and detail views, providing access for underlying combat data research.

### v1.0.7

Added activity information queries, adjusted default character tag displays with support for Rossi's special tags, and added site traffic statistics.

### v1.0.6

Added a sponsor list and related styles to the About page, improving the display of project acknowledgments.

### v1.0.5

Completed mobile adaptation for major modules including characters, weapons, enemies, equipment, items, dungeons, and achievements across all three themes.

### v1.0.4

Added filters to character, weapon, and item modules and rebuilt list filtering areas to improve searches across large numbers of entries.

### v1.0.3

Added the item query interface and registered the item module, supporting item lists, details, and related basic information.

### v1.0.2

Added skill icons and base skills to character pages, including facility types, skill levels, descriptions, and unlock conditions, while fixing related data.

### v1.0.1

Fixed abnormal displays of fixed enemy stat data and improved the corresponding enemy information on dungeon pages.

### v1.0.0

Officially launched AKEData 1.0, completing major dungeon query improvements and raising the project version from 0.99 to 1.0.
