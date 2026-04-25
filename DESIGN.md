# Design System Document: The Courtside Editorial
 
## 1. Overview & Creative North Star
### The Creative North Star: "Kinetic Precision"
This design system moves away from the static, spreadsheet-like nature of traditional sports data. Instead, it adopts the persona of a **High-End Digital Broadcaster**. The aesthetic is "Kinetic Precision"—capturing the raw, aggressive energy of the court through bold typography and high-contrast accents, while maintaining the surgical accuracy required for professional analytics.
 
We break the "template" look by rejecting the standard boxy grid. Instead, we utilize **intentional asymmetry**, overlapping "player" elements that break container boundaries, and a typography scale that favors dramatic "Display" moments. The goal is to make the user feel like they are looking at a live broadcast feed, not a database.
 
---
 
## 2. Colors & Surface Philosophy
The palette is rooted in the deep shadows of an arena, punctuated by neon-bright highlights that draw the eye to critical performance shifts.
 
### The "No-Line" Rule
**Borders are strictly prohibited for sectioning.** To create separation, use background color shifts. A `surface-container-low` section sitting on a `surface` background provides all the definition needed. If you feel the urge to draw a line, use white space instead.
 
### Surface Hierarchy & Nesting
Depth is built through "Tonal Stacking." Avoid flat layouts by nesting containers:
*   **Base:** `surface` (#0b1326) – The floor of the arena.
*   **Sections:** `surface-container-low` (#131b2e) – Large groupings of data.
*   **Cards:** `surface-container-high` (#222a3d) – Individual stat modules.
*   **Active/Pop-out:** `surface-container-highest` (#2d3449) – Hover states or focused metrics.
 
### The "Glass & Gradient" Rule
To inject "soul" into the data:
*   **Glassmorphism:** Use `surface-variant` at 60% opacity with a `20px` backdrop blur for floating headers or player comparison overlays.
*   **Signature Gradients:** Main Action buttons or "Hot Streak" indicators must use a linear gradient from `primary` (#ffb599) to `primary_container` (#f26522) at a 135-degree angle.
 
---
 
## 3. Typography
Typography is our primary tool for storytelling. We use three distinct families to create an editorial hierarchy.
 
*   **Display & Headlines (Space Grotesk):** This is our "Jersey" font. It is bold, condensed, and aggressive. Use `display-lg` for game scores and `headline-md` for player names. It should feel like it was stenciled onto a locker room wall.
*   **Titles & Body (Inter):** Our workhorse. Used for narrative descriptions and UI labels. It provides a neutral, high-readability balance to the loud headlines.
*   **Metrics & Labels (Public Sans):** Chosen for its tabular lining (numbers align perfectly). Every percentage, PER, or PPG metric must use Public Sans to ensure vertical scanning is effortless.
 
---
 
## 4. Elevation & Depth
In this system, elevation is a product of light and layering, not structural scaffolding.
 
*   **The Layering Principle:** Achieve "lift" by placing a `surface-container-lowest` card on top of a `surface-container-low` section. The subtle shift in navy tones creates a natural, sophisticated hierarchy.
*   **Ambient Shadows:** For floating modals (like a player’s detailed shot chart), use a wide-spread shadow: `0px 24px 48px rgba(6, 14, 32, 0.4)`. The shadow must be a deep navy, never pure black, to maintain the "Dark Theme" richness.
*   **The Ghost Border Fallback:** For accessibility in high-density tables, use a "Ghost Border": `outline-variant` (#594138) at **15% opacity**. It should be felt, not seen.
 
---
 
## 5. Components
 
### Player & Statistic Cards
*   **Styling:** No borders. Use `lg` (0.5rem) roundedness.
*   **Visual Flair:** Players' headshots should "break the frame," extending slightly above the top of the card container using a negative margin.
*   **Background:** Use a subtle radial gradient of `secondary_container` in the corner of the card to highlight the "Primary Stat."
 
### Data Tables (The "Box Score")
*   **Forbid Dividers:** Use `surface-container-low` for even rows and `surface-container-high` for hover states. 
*   **Highlight Rows:** Use a 2px vertical "accent bar" of `primary` (orange) on the far left of a row to indicate a "Key Performer" or "Live Selection," rather than highlighting the whole row in a bright color.
 
### Buttons
*   **Primary:** Gradient fill (`primary` to `primary_container`), `on_primary` text, `full` roundedness for a sleek, aerodynamic look.
*   **Secondary:** `outline-variant` (Ghost Border) with `on_surface` text. No fill.
 
### Performance Charts
*   **Positive/Negative:** Use `tertiary` (#4ae176) for "Above Average" and `error` (#ffb4ab) for "Below Average."
*   **Area Glow:** Line charts should have a subtle glow (drop shadow) of the same color to mimic neon arena lights.
 
---
 
## 6. Do’s and Don’ts
 
### Do
*   **Do** use extreme contrast in typography. Pair a `display-lg` score with a `label-sm` caption.
*   **Do** embrace "Data Density." Sports fans want the numbers; use `body-sm` for secondary stats to pack information without clutter.
*   **Do** use `tertiary_container` for positive stat highlights (e.g., a green background pill for a 50% FG shooter).
 
### Don’t
*   **Don't** use pure white (#FFFFFF). Use `on_surface` (#dae2fd) to prevent eye strain on the dark background.
*   **Don't** use standard 1px borders to separate table cells. It creates visual noise that slows down data ingestion.
*   **Don't** use rounded corners larger than `xl` (0.75rem) for functional containers; keep it sharp and professional. Only buttons get the `full` pill shape.