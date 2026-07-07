# Capability Client Architecture v1

## Purpose
This document defines the planned shared Capability Client layer for external capability providers in Atlas.

## Shared Service Model
The Capability Client is a shared service consumed by provider implementations.

Providers are responsible for provider-specific semantics and mapping, while the shared client is responsible for transport and cross-cutting execution concerns.

## Provider Implementation Direction
Providers should not implement raw HTTP logic directly in the long term.

As the platform evolves, provider implementations should delegate outbound request handling to the shared Capability Client.

## Planned Capability Client Responsibilities
The shared client will eventually handle:

- request execution
- authentication headers
- timeouts
- retries
- error normalization
- response normalization support
- logging
- rate-limit handling

## First Consumer
PerplexityProvider will be the first consumer of the shared Capability Client.

## Future Provider Support
The design must support current and future provider integrations, including:

- OpenAI
- Claude
- Gemini
- Tavily
- Reddit
- SEC
- YouTube
- internal Atlas services

## Story Scope Constraint
No runtime code is changed in this story.

This story is documentation-only and records the architectural direction for the shared client layer.
