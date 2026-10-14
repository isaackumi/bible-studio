# Product vision

Church Studio is a commercial desktop application for church presentation and live production. It is the operator's tool for scripture, lyrics, slides, media, and a protected audience output. It is not a clone of PewBeam, FreeShow, OBS, ProPresenter, EasyWorship, Quelea, OpenLP, or vMix. Those products are references for workflows.

The operator loop is:

```text
FIND → PREPARE → PREVIEW → TAKE → PROGRAM → OUTPUT
```

Selecting or editing content changes Preview. Program changes only through Take, Cut, Clear, Black, and Logo. That rule lives in the live state machine, not only in the screen.

The desktop app stays useful with the network off. Accounts, sync, and licenses are later services. They must not become required to run a service.

## Who it is for

- A volunteer runs next, previous, clear, and a Bible lookup during the service.
- A producer builds the service, the workspace, and the display assignments ahead of time.
- A later stage display serves the speaker. It is a saved display role now and a window later.

## What this release establishes

The presentation engine, Bible, lyrics, slides, images, themes, and services were already in the app. This release adds the two systems the product is organized around:

- A workspace the operator can rearrange, save, and restore.
- A display profile that assigns Operator, Audience, and Stage, and recovers the audience window when a monitor returns.

Different workflows share one production engine. Bible Operator, Live Production, and Simple Presenter are layouts over the same preview, program, and output path. A future production layout can add inputs and mix without replacing that path.

## Commercial shape

The product should be able to grow into free, pro, church, and enterprise plans, plus add-ons. Those plans are not implemented. Features that are not in the core desktop app are closed by `canUse()` so they can be opened later without scattering license checks through the live path.

## What stays out until the core is dull

Speech detection, NDI, streaming, recording, cloud sync, remote control, accounts, and billing. The boundaries for them are described in `product-architecture.md` and `subscription-architecture.md`.
