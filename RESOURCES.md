# Resources

Recommendations, not requirements. Nothing here is assigned and nothing here is graded.

Every link was checked and working as of July 31, 2026.
If one has rotted by the time you read this, tell me.

---

## Read this part first

Ten rules. Follow them and a page built by someone with no design training will still look deliberate.

1. **Cap your line length.** Set `max-width: 65ch` on whatever holds your text. Long lines are genuinely hard to read. This is the highest-impact single line of CSS you will write, and it is already in `style.css`.

2. **Make your body text bigger and looser than feels right.** 18-20px, `line-height: 1.6`. The browser default of 16px at 1.2 is why most beginner pages feel cramped.

3. **Two typefaces maximum. One is completely fine.** If you use two, make them obviously different: a serif with a geometric sans, or a display face with a plain body face. Two similar sans-serifs read as an accident rather than a choice.

4. **Pick a type scale and never set an arbitrary font size again.** Generate one at [Type Scale](https://typescale.com/) and use only those values. Make the jumps large: your `h1` should be around 3x your body text, not 1.4x. Timid type scales are the most common reason a page looks unfinished.

5. **One background color, one text color, one accent.** Use the accent sparingly, on links and maybe one button. Every extra color is a decision you then have to justify on every element.

6. **Space everything on a scale of 8.** Use 8, 16, 24, 32, 48, 64, 96px and nothing in between. Inconsistent spacing is what people are reacting to when they say a page "looks off" but cannot say why.

7. **Group things with whitespace, not with boxes and lines.** Before you add a border or a card or a divider, try just increasing the gap. It usually works and the page gets quieter.

8. **Check your text contrast** at the [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/). You need 4.5:1 for normal text, 3:1 at 24px or larger. Light grey text on white is the most common accessibility failure on personal sites, and it looks fine to you on a good screen in a dark room.

9. **One bold move, everything else quiet.** Pick a single memorable thing: an oversized name, one full-bleed image, one unexpected color. Then make everything around it disciplined. Boldness in five places is noise. Boldness in one place is confidence.

10. **Look at it on your phone before you call it done.** Then look at it again at 200% browser zoom. Most pages designed on a big monitor fail both.

Two rules about content that matter as much as any of the above.
**Write the words before you design the page**, because a layout built around placeholder text will not survive real text.
And **use a real photo of yourself or your actual work.** Stock photography of strangers at laptops is the fastest way to make a personal site look generic.

---

## Design fundamentals

- **[Typography in Ten Minutes](https://practicaltypography.com/typography-in-ten-minutes.html)** - Five rules, ten minutes, and the best value per minute on this entire page. Free to read.
- **[Summary of Key Rules](https://practicaltypography.com/summary-of-key-rules.html)** - The same book's checklist. Work down it with your page open next to it.
- **[Building Your Color Palette](https://refactoringui.com/previews/building-your-color-palette)** - The free chapter of Refactoring UI, and happily the one non-designers need most: build greys plus one primary, and stop generating palettes off a color wheel.
- **[Realtime Colors](https://www.realtimecolors.com/)** - Pick colors and see them applied to a realistic page instead of five swatches. Exports CSS variables, has contrast checking built in. The best palette tool if you are not a designer.
- **[Google Fonts Knowledge](https://fonts.google.com/knowledge)** - A free, well-illustrated typography course. Start with [Choosing type](https://fonts.google.com/knowledge/choosing_type).
- **[web.dev: Learn Responsive Design](https://web.dev/learn/design)** - Free course from the Chrome team. For this project, read the Typography, Macro layouts and Micro layouts modules and skip the rest.
- **[Utopia](https://utopia.fyi/type/calculator/)** - Generates type that scales smoothly between phone and desktop using `clamp()`, so you need far fewer media queries.

## Accessibility

Five things carry nearly all the value: contrast, semantic HTML, alt text, keyboard navigation, and visible focus.

- **[Designing for Web Accessibility](https://www.w3.org/WAI/tips/designing/)** - One short page. If you read only one thing here, read this.
- **[Alt Text Decision Tree](https://www.w3.org/WAI/tutorials/images/decision-tree/)** - A literal flowchart for "what do I put in this alt attribute", including when the right answer is `alt=""`. Ends the guessing.
- **[Page Structure](https://www.w3.org/WAI/tutorials/page-structure/)** - Why `<header>`, `<nav>`, `<main>`, `<footer>` and a correct heading order matter. This is basically all of "semantic HTML" for a personal site.
- **[Lighthouse](https://developer.chrome.com/docs/lighthouse/overview)** - Already in Chrome DevTools. Run the Accessibility audit against your live URL and it will find missing alt text, low contrast, and bad heading order in about ten seconds.
- **[MDN: `:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible)** - If you ever write `outline: none`, you owe the page a focus style in the same commit. Tab through your finished site. If you lose track of where you are, it is broken.

## Real personal sites worth studying

Galleries are for mood. These are for study, because they are sites you could actually build.

**Minimal and text-forward**

- **[sive.rs](https://sive.rs/)** - Derek Sivers. Body copy capped at `max-width: 60ch` in a serif face. The single most copyable CSS rule on this list.
- **[danluu.com](https://danluu.com/)** - About five CSS declarations total, including `color-scheme: light dark` for free dark mode. Proof that a bare dated link list can still read as intentional. Its one real flaw is unbounded line length on a wide monitor, which rule 1 above would fix.
- **[matthewbutterick.com](https://matthewbutterick.com/)** - The author of *Practical Typography*, so the site is the argument. One page, one serif, one size, and no navigation bar at all: links live inside the prose.

**Academic and research**

- **[karpathy.ai](https://karpathy.ai/)** - The page itself says "0 frameworks were used to make this simple responsive website", and the CSS backs it up. Two media queries do all the responsive work. Reverse-chronological year headings with small thumbnails make a CV scannable.
- **[lilianweng.github.io](https://lilianweng.github.io/)** - Every post entry carries a date, a reading time, and a two-line excerpt. That excerpt is what turns a wall of titles into something browsable, and it is the cheapest high-value addition you can make to a list page.
- **[nlp.stanford.edu/~manning](https://nlp.stanford.edu/~manning/)** - Black on white, a small headshot, and rather than embedding 300 papers it links out to Google Scholar. The restraint lesson: a senior academic page delegates instead of rendering everything.
- **[sebastianraschka.com](https://sebastianraschka.com/)** - The polished end of this group. Shows how to fit books, courses and a blog on one site without clutter, by keeping exactly one accent treatment and letting thumbnails carry the color.

**More personality**

- **[joshwcomeau.com](https://www.joshwcomeau.com/)** - A hand-drawn self-portrait, drawn twice for light and dark mode, is the entire personality budget. One illustrated asset buys more warmth than a whole colorful theme.
- **[maggieappleton.com](https://maggieappleton.com/)** - Content sorted by *confidence* rather than by date: finished essays in one place, "loose notes on things I don't entirely understand yet" in another. Genuinely useful if you have three good things and eleven half-finished ones.
- **[ciechanow.ski](https://ciechanow.ski/)** - A narrow column of text interrupted every few paragraphs by a full-bleed figure. That rhythm *is* the design, and it works exactly the same with static images.
- **[brittanychiang.com](https://brittanychiang.com/)** - Fixed left column with name and section links, right column scrolls. The most-imitated developer portfolio layout on the web, and reproducible in about 30 lines of CSS grid plus `position: sticky`.

**Galleries** - [Minimal Gallery](https://minimal.gallery/) (best signal-to-noise for this project) · [SiteInspire](https://www.siteinspire.com/) · [One Page Love](https://onepagelove.com/)

## Fonts, icons, images

Check the license before you use anything. "Free to download" and "free to use on your site" are different claims.

- **[Google Fonts](https://fonts.google.com/)** - Almost everything is Open Font License: free, commercial use fine, no attribution needed. The safe default.
- **[Modern Font Stacks](https://modernfontstacks.com/)** - Pure system-font CSS stacks, copy and paste, CC0. Zero download, instant render, no layout shift. The best option if you want good type with no web font at all.
- **[Fontpair](https://fontpair.co/)** - Curated pairings, if rule 3 above has you stuck.
- **[Lucide](https://lucide.dev/)** (ISC) or **[Heroicons](https://heroicons.com/)** (MIT) - Clean icon sets. Pick one and use only that one.
- **[Simple Icons](https://simpleicons.org/)** (CC0) - Brand logos for your contact row: GitHub, LinkedIn, ORCID, Google Scholar.
- **[Unsplash](https://unsplash.com/license)** and **[Pexels](https://www.pexels.com/license/)** - Free photos, commercial use fine, attribution appreciated but not required.
- **[unDraw](https://undraw.co/illustrations)** - Open-source illustrations you can recolor to your accent color in the browser. No attribution required.

## Using Claude for design

This is the part that makes this a 2026 assignment rather than a 2015 one.
Claude is not just typing your CSS. It can hold a design opinion, look at your rendered page, and criticize it.

### Claude Code as a design collaborator

**Give it something to look at.** Claude Code reads images. Drag one into the window, paste it, or give it a file path. Screenshots of sites you like are the fastest way to communicate taste.

**Close the loop visually.** This is the single highest-value technique in the project, and it is the same verification idea from Lecture 3 applied to design. Instead of:

> make the dashboard look better

do this:

> [paste screenshot] implement this design. take a screenshot of the result, compare it to the original, list the differences and fix them

**There is a `frontend-design` plugin** for Claude Code, built to push it toward distinctive interfaces and away from generic AI aesthetics. Run `/plugin` to browse and install it. It nudges Claude to commit to a named palette, choose typefaces deliberately, and pick one signature element rather than decorating everywhere.

**Anthropic's [Frontend Aesthetics prompting guide](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)** documents what actually improves output and publishes reusable prompt text. Its typography advice is bracingly opinionated: avoid the default-feeling fonts, use weight extremes rather than 400 against 600, and make size jumps 3x rather than 1.5x. Worth reading, and worth dropping a short version into your project's `CLAUDE.md` so it applies every session.

Prompts you can paste:

> Before writing any code, propose three genuinely different visual directions for my personal site. For each: 4-6 named hex colors, a display typeface and a body typeface from Google Fonts, a one-sentence layout concept, and the one element the page will be remembered by. No CSS yet. I will pick one.

> Here are screenshots of three sites I like [drag in images]. Tell me what they actually have in common: type scale, line length, spacing rhythm, palette discipline. Then propose a direction for my site that shares those structural qualities without copying their surface style.

> Serve this folder, open it, screenshot it, and critique it as a design lead would. Be specific and harsh. Check line length, whether the type scale has real contrast, whether spacing is consistent, and whether the palette is disciplined. Rank the fixes, then apply the top three.

> Resize to 375px wide, screenshot, and tell me everything that breaks. Fix it, then screenshot again to confirm.

> Audit this page for accessibility: every text and background pair against 4.5:1, heading order sequential, alt text on every image, focus visible on every interactive element. Report what fails, then fix it.

> Look at this page and tell me the single most decorative element that is not earning its place. Remove it and show me the diff.

### Artifacts on claude.ai, for fast prototyping

Before you commit to a direction in code, prototype it in [claude.ai](https://claude.ai).
[Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them) render a full HTML page in a panel next to the chat and keep a version history you can flip between.
Comparing three rendered options takes seconds there and minutes per option in a local build loop.

> Build three complete single-page personal site designs for a geology student, as three separate artifacts. Same content in each: name, one-paragraph bio, three projects, contact links. Make them visually distinct: different typefaces, different palettes, different layout structures.

> Take artifact 2 and give me four variations that change only the typography. Keep the layout and colors identical so I can see just the type decision.

### Anthropic's own design language, as one reference

Anthropic publishes its brand system openly as a [Claude skill](https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md), and it is worth reading precisely because it is short and complete: four neutrals, three accents, two typefaces, and a rule for when each gets used.

That is the whole thing. Your site needs one of these too, and it should be about that long.

Study the *structure* of the system rather than copying the values. A page that uses Anthropic's exact palette will look like Anthropic, which is the opposite of the point.

## If you would rather start from a theme

All are free, MIT licensed, and actively maintained.

- **[academicpages](https://github.com/academicpages/academicpages.github.io)** - Jekyll. The lowest-friction option: use the template, edit some Markdown and a config file. Good if you do not want to touch CSS.
- **[al-folio](https://github.com/alshedivat/al-folio)** - Jekyll. The standard academic theme, with a publications page driven by BibTeX. Good if you have papers or projects to list.
- **[hugo-PaperMod](https://github.com/adityatelange/hugo-PaperMod)** - Hugo. Content-first with dark mode, search and tags built in. Lilian Weng's site above runs on it, so you can see the theme and a polished real instance side by side.

Starting from a theme is a completely legitimate choice.
Just make sure `DECISIONS.md` question 2 explains what you gave up by taking it, because you did give up something.
