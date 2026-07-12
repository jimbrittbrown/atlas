# Atlas Documentary Benchmark Library Architecture

Status: Planning-only architecture
Owner: Office of the CEO
Scope: Documentary study framework only
Effective Date: 2026-07-10

## Purpose
The Atlas Documentary Benchmark Library provides a structured way to study high-quality documentaries and extract reusable production patterns without ingesting copyrighted scripts, footage, or transcribed source material.

The library exists to support future documentary analysis work by capturing only derived observations, timing patterns, and production-level insights.

## Non-Goals
The Benchmark Library does not:
1. Modify the production pipeline.
2. Modify Atlas Academy.
3. Store or reproduce copyrighted scripts.
4. Store or reproduce copyrighted footage.
5. Auto-generate production missions.
6. Replace the existing Topic Selection Engine or runtime governance layers.

## Design Principles
1. Observation-only, not source replication.
2. Structure first, content second.
3. Copyright-safe by default.
4. Analysis records must be auditable and comparable across documentaries.
5. Each benchmark entry should be versioned and append-only.
6. The library should remain independent from production execution.

## What the Library Records
Each documentary benchmark may record derived observations such as:
1. Hook structure.
2. Curiosity progression.
3. Reveal timing.
4. Beat density.
5. Visual change frequency.
6. Narration pacing.
7. Information density.
8. Emotional progression.
9. Ending structure.
10. Overall production observations.

## Data Boundary Rules
The library may store:
1. Documentary title.
2. Studio-entered benchmark identifier.
3. Observation notes written by Atlas.
4. Derived timing and structural measurements.
5. Comparative ranking notes.
6. Production pattern summaries.
7. Review conclusions.

The library must not store:
1. Full scripts.
2. Transcript dumps.
3. Shot-for-shot footage reproductions.
4. Copyrighted narration text copied from a source work.
5. Any asset that substitutes for the original work.

## Library Structure
The library is organized into benchmark records, observation sets, and reusable templates.

### Recommended Storage Model
```text
research/documentary-benchmark-library/
  README.md
  studies/
    README.md
    benchmark-YYYY-NNNN.md
  observations/
    README.md
    observation-template.md
  templates/
    README.md
    documentary-benchmark-analysis-template.md
```

### Record Types
1. Benchmark record.
2. Observation record.
3. Comparative note.
4. Pattern summary.
5. Review memo.

## Benchmark Record Contract
Each benchmark record should include:
1. Benchmark ID.
2. Documentary title.
3. Source type.
4. Observation date.
5. Analyst or reviewer.
6. Observation categories.
7. High-level findings.
8. Comparative notes.
9. Reuse recommendations.
10. Copyright safety note.

## Observation Categories
Each benchmark study should support structured notes for:
1. Hook.
2. Curiosity curve.
3. Reveal timing.
4. Beat pacing.
5. Visual cadence.
6. Narration cadence.
7. Information payload density.
8. Emotional arc.
9. Ending cadence.
10. Overall production assessment.

## Suggested Storage Lifecycle
1. Capture the benchmark metadata.
2. Record observations in the study folder.
3. Summarize reusable patterns in the observations folder.
4. Promote reusable templates into the templates folder.
5. Keep everything append-only and reviewable.

## Future Extension Points
Future versions may add:
1. Multi-document comparison reports.
2. Pattern index pages.
3. Category trend summaries.
4. Benchmark scoring rubrics.
5. Executive review annotations.

## Governance Rule
The Benchmark Library is a documentation and storage framework only.
It does not authorize production changes, scheduling changes, or Academy changes.