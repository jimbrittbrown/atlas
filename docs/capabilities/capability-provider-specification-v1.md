# Atlas Capability Provider Specification v1.0

## Purpose

This specification defines how Atlas integrates with external capability providers.

A provider may supply research, reasoning, search, memory, finance, media, code, or other specialized capabilities.

All providers must follow the same contract so Atlas can add, replace, compare, and monitor providers without changing core runtime architecture.

## Core Principle

Departments do not call external systems directly.

Departments request capabilities.

The Integration Department manages providers.

## Required Provider Interface

Every provider must support:

- identity()
- capabilities()
- health()
- validate(request)
- execute(request)
- normalize(response)

## Provider Identity

Each provider must declare:

- name
- vendor
- version
- purpose
- authentication type
- supported capabilities
- status

## Capability Declaration

Providers declare what they can do, such as:

- research
- search
- reasoning
- summarization
- code
- images
- video
- audio
- finance
- legal
- scientific
- memory

## Standard Capability Request

A capability request should include:

- requestId
- missionId
- department
- capability
- objective
- input
- constraints
- priority
- timeout
- metadata

## Standard Capability Response

A capability response should include:

- provider
- providerVersion
- timestamp
- status
- confidence
- citations
- content
- latency
- usage
- metadata
- errors

## Health Model

Provider health should track:

- available
- authenticated
- latency
- lastSuccessfulCall
- failureCount
- rateLimitStatus
- lastHealthCheck

## Architectural Rule

Provider-specific logic belongs inside the provider implementation.

Atlas core systems should only interact with standardized capability requests and responses.

## Sprint 2 Reference Provider

Perplexity will be the first reference implementation for live research evidence.

