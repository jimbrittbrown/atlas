# Architecture

## Purpose
Convert raw public business signals into structured, validated, confidence-scored data ready for website production intake.

## Components

### 1) Company Research Module
Extracts and normalizes:
- Website URL
- Company name
- Logo
- Primary colors
- Contact information
- Service list
- Service areas
- Existing messaging
- Certifications
- Financing options
- Existing reviews
- Social links

### 2) Brand Asset Package Builder
Maps research outputs into Website Production System compatible branding payload.

### 3) Asset Validation Engine
Detects missing critical inputs:
- Logo
- Images
- Contact information
- Reviews
- Colors

### 4) Confidence Engine
Scores every extracted field and labels uncertain fields.

### 5) Executive Summary Generator
Produces:
- Business overview
- Brand strengths
- Missing assets
- Customization readiness score

## Data Flow
Raw source data -> Research normalization -> Confidence scoring -> Asset validation -> Brand asset package -> Executive summary

## Boundaries
- In scope: research intelligence and packaging.
- Out of scope: template rendering, content substitution, QA web checks, deployment.
