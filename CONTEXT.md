# Coo

Coo brings AI-grounded discussion and editing into a note. Every action is grounded in a passage the user is working on, and writes its result back into the note. The work splits into two modes.

## Modes

**Reading mode**:
Engaging with a passage the user is trying to understand — asking about it and folding the discussion back in.
_Avoid_: study mode, learn mode

**Writing mode**:
Improving a passage the user authored.
_Avoid_: authoring mode, composition mode

## Actions

**Ask**:
An explanation a reader requests about a passage, preserved as a note beneath it.
_Avoid_: query, chat

**Rewrite** (reading mode):
Folding the questions-and-answers gathered about a passage back into the passage itself. Reactive — it depends on prior notes existing.
_Avoid_: revise, merge

**Edit** (writing mode):
Constructing a coherent passage from the author's fragments — a thought they couldn't yet express. Proactive — it needs no prior notes.
_Avoid_: polish, rewrite (that name is taken), fix

## Artifacts

**Note**:
A question-and-answer about a passage, kept beneath it (the output of Ask). Rewrite consumes notes.
_Avoid_: comment, annotation

**Revision**:
A numbered passage constructed by Edit from the author's fragments, kept beneath them for review. Later edits can reference a prior revision by number.
_Avoid_: edit (ambiguous with the action), version, draft

## Edit inputs

**Materials**:
The fragments — rough pieces of a single thought — that Edit constructs a passage from. Written as ordinary body text.
_Avoid_: source, input, text

**Guidelines**:
The editing direction for a construction (tone, length, focus), kept beside the materials.
_Avoid_: instructions, prompt, direction
