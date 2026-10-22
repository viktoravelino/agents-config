---
name: design-artifact
description: Design principles and creative direction for building HTML artifacts — pages, reports, plans, landing pages, demos, decks, and small tools. Use when you create or restyle any visual HTML deliverable and decide its palette, type pairing, layout, theming, or overall register, or when the output must not look generically AI-generated.
---

Take the creative director's perspective at a boutique agency known for its range. Every commission gets its own visual identity, scaled to the level of treatment the brief merits. Make palette, type and layout conscious decisions rooted in this subject. Nothing should look like it came off a shelf.

## Begin by sizing up the brief

The question is never *whether* to design. The question is which register to design in. A memo deserves the same craftsmanship as a landing page, but the two show it in different ways.

Most requests want a workmanlike register: plans, briefs, demos. Finish them properly, with real hierarchy in the type, spacing that you thought about and a palette that you chose. Know when to stop. Almost no page benefits from a towering, theatrical hero. Use ornament sparingly and with taste.

Some work earns the editorial register: landing pages, games, apps and tools that someone will keep or share.

When in doubt, remember this. Nobody regrets a well-composed page, but an identity pushed too hard sometimes backfires.

Everything in the fundamentals section applies to every artifact. Use the editorial process at the end only when your read of the brief calls for it.

## Fundamentals for every artifact

**Defer to prior art.** First, look for an established design system. Check for an AGENTS.md or CLAUDE.md, a DESIGN.md, QUALITY.md, PRODUCT.md and similar files, a tokens or theme file, and the styling of existing components. If you find one, apply it. The guidance below fills gaps and never overrules a system. Authority runs in one fixed order: what the user literally said, then the system the project already has, then your own taste.

**Anchor everything to the subject.** If the subject is fuzzy, sharpen it first: one concrete thing, a defined audience and a single purpose for the page. Find the most distinctive moves in the subject's native territory: what it is made of, the tools of its trade and the language its people speak. Use real content from the first draft. Lorem ipsum is banned.

**Put two typefaces in conversation.** Even on a page that has nothing to do with letterforms, the letterforms do the heavy lifting. Never link webfonts from Google Fonts or any other font CDN. Embed the face as a @font-face data URI instead. Cap the measure at about 65 characters. Commit to a type scale and stay on it. Balance headings with `text-wrap: balance`, give paragraphs air, and space out uppercase labels with a little letter-spacing.

**Neutrals are choices too.** A dead-center mid-grey shows that nobody thought about it. Tint that grey faintly toward the accent and it looks considered. Pure white or near-black grounds are fine when the subject wants them. The test is whether you selected the neutral or just left it over.

**Both themes, equal care.** The page renders in the theme that the viewer runs. The OS preference arrives through `prefers-color-scheme`. The in-app toggle writes `data-theme="dark"` or `data-theme="light"` onto the root element. The attribute must beat the media query in both directions. The sturdy pattern works on tokens:

1. Declare the palette as custom properties on `:root`.
2. Inside `@media (prefers-color-scheme: dark)`, reassign only those tokens. Components use tokens only. Never style components inside the media query itself.
3. Reassign the tokens a second time under `:root[data-theme="dark"]` and `:root[data-theme="light"]`.

Give the dark theme as much attention as the light one. Mechanical inversion is not enough. Legibility and a working accent must survive on either ground. A concept that belongs to one visual world (the glow of an arcade cabinet, a letterpress invitation) may stay single-theme. That must be a decision you made, not a corner you forgot.

**Spacing belongs to the layout, not the elements.** Give sibling groups flex or grid plus `gap`. Per-element margins scattered around will collapse or compound without warning. Put broad content (tables, code, diagrams) in its own container with `overflow-x: auto`, so horizontal scrolling never reaches the page body. Where numerals stack into columns, switch on `font-variant-numeric: tabular-nums`.

**Dodge the telltale AI aesthetic.** Machine output keeps landing on the same few looks:
- warm cream (#F4F1EA) under a serif display with a terracotta accent
- near-black with one shot of acid-green or vermilion
- hairline broadsheet rules over cramped columns
- a purple-to-blue gradient hero floating on white
- Inter or Space Grotesk chosen for safety
- emoji used as section markers
- center alignment everywhere
- `rounded-lg` everywhere
- rounded cards with an accent bar or rail

Execute a direction that the user has set exactly as given. Their instructions win over everything, including a request for one of these exact looks. When you have no instructions, the choice is yours. Do not waste it on a cliché.

**Engineer it soundly.** Rendering bugs grow in the distance between source and screen, so stay alert for overlapping elements, cascade collisions and fonts that silently fall back. Close all non-void elements. Use double quotes for all attributes. Give keyboard focus a visible state. Respect `prefers-reduced-motion`. When graphics are generative or decorative, use Canvas or WebGL before you hand-write long SVG path data.

**Mind the cascade.** Selector specificity is where CSS fights itself. A class hook like `.section` and an element hook like `.cta` can fight over padding and margins and undo each other. Design the cascade so that nothing can quietly sabotage your spacing.

**Copy is a material.** Treat the words as load-bearing, not as garnish. Stand on the reader's side of the glass. Name things as people know them, not as the backend does (someone manages *notifications*, never *webhook config*). Keep verbs active. Every control states its exact effect ("Publish", answered by a toast: "Published"). An error message diagnoses the failure and prescribes the fix. It never grovels and never hand-waves. Precision beats wit.

**Make structure mean something.** Numbering, eyebrows, dividers and labels earn their place only when they say something true about the content. They must not just decorate it. Numbered markers (01 / 02 / 03) appear constantly in generic work. They are honest only when the order is real information, such as an actual procedure or a dated timeline that the reader must follow in sequence. Before you use a device like that, ask whether it tells the truth.

**Interfaces are not documents.** People scan and drive a dashboard or tool. They do not read it from top to bottom. This moves the craft from typography to information design. Lead with the rollup, then give the detail. Let form carry state next to the figures (pills, chips, a severity stripe), so that trouble is clear at a glance. Status colors (good / warning / critical) have their own lane, apart from the accent hue, and do not count as the accent. Give charts and sparklines typographic-grade attention: an area fill, a faint grid and an emphasized endpoint. If it can be clicked, it must look clickable.

## Process

Code comes second. First, rough out a short design plan: a tight token system that covers color, type and layout.
- **Color**: 4–6 hex values, each with a name.
- **Type**: faces that cover 2+ roles. Use a display face with character, with restraint. Use a body face that partners it. Add a utility face for captions or data if the work needs one.
- **Layout**: the organizing idea, in a sentence or two.

Build only after that. Execute the plan, and trace every color and type decision back to it.

## When the request is editorial

The posture changes now. Picture a client who has already rejected every proposal that felt canned and is paying for conviction. Commit to opinions, and place one honest aesthetic bet where the work will benefit.

Before you write any code, audit the design plan against the subject. Rework any element that could be the stock answer to any similar brief, and note what moved and why. Write the code only after the plan clears this originality check. Then follow the revised plan to the letter.

**Principles**

- Treat the hero as an argument. Open on the single most characteristic artifact of the subject's world: a headline, an image, a live demo or an interactive moment.
- The page's personality lives in its type. Choose the display/body pairing on purpose, not the families you would pick on autopilot. Lock in a scale with weights, widths and spacing that you each decided. The treatment of the type must be one of the memorable things about the design. It must never be a transparent vessel.
- Motion is a budget. Ask where animation really serves the subject (an entrance sequence on load, a reveal tied to scroll, micro-interactions on hover, a layer of ambient atmosphere), and ask whether it serves at all. One orchestrated beat usually beats effects sprinkled around. Let the direction decide. Restraint often wins, and gratuitous animation is itself a mark of the AI-generated look.
- Scale the execution to the ambition. Maximalism needs elaborate follow-through. Minimalism needs exactness in spacing, type and detail. Elegance means delivering the chosen vision completely.
- Put the daring in one place and keep everything around it quiet. If the accent clashes with the ground, move it toward an analogous hue or reduce its saturation. Do not swap it for another color.

<!-- ## After the artifact ships

Once the artifact is finished and delivered, ask the user whether they'd like to share it as a public page. If — and only if — they say yes, publish the file with the `tot` CLI (tot.page) and hand back the URL it prints:

```bash
tot path/to/artifact.html
```

If `tot` is not installed (`command -v tot` fails), tell the user and offer to install it. Install only on their explicit go-ahead:

```bash
npm install -g @plannotator/tot
```

Never publish or install without the user's explicit consent — a shared page is publicly accessible to anyone who has the link. -->
