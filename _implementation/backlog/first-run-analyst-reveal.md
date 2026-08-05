# First-run analyst reveal

## Summary

Add a guided first-run experience that turns the initial data-drop moment into a smooth reveal of the product's core workflow. When a user drops data into the app, the interface should transition into the map view, then surface a compact analyst-mode prompt near the bottom of the workspace. When the user clicks it, the relevant side panels slide in with motion to reveal the next analytical actions.

## Product intent

This feature is meant to make the first experience feel intelligent and guided rather than purely blank or mechanical. The goal is to teach the user the workflow in a way that feels natural:

1. data is dropped,
2. the app transitions into the map view,
3. the user is invited into analyst mode,
4. the workspace expands around the next best actions.

This should make the app feel proactive and help communicate the core promise of DataScope: move from raw data to understanding with a guided reveal.

## Proposed interaction

- On first data load, animate the UI into the map-focused workspace.
- Show a lightweight prompt near the bottom of the viewport, framed as an analyst-mode invitation.
- On activation, animate side panels into view with smooth, deliberate motion.
- The revealed panels should surface a small set of next actions, such as:
  - inspect joins
  - inspect data quality
  - open suggested insights
  - move into a deeper analysis flow
- The interaction should be optional and should feel like a guided onboarding moment, not a forced modal.

## UX goals

- Make the first-run experience feel confident and polished.
- Reduce the ambiguity of "what should I do next?"
- Reinforce the product's identity as a guided analytical workspace, not just a static viewer.
- Keep the motion subtle, quick, and purposeful.

## Scope note

This is a product interaction and onboarding feature, not a core engine change. It should be implemented as a lightweight experience layer that can be enabled for first-run or first-dataset use cases.

## Notes

This is a good fit for the broader onboarding and workbench experience direction. It should be designed so that the reveal feels helpful and celebratory without becoming distracting or overly animated.
