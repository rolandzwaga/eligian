/**
 * Grammar and Parsing Tests
 *
 * Tests the Langium grammar to ensure it correctly parses valid DSL
 * programs and rejects invalid ones.
 */

import { describe, test, expect } from "vitest"
import { createEligianServices } from "../eligian-module.js"
import { EmptyFileSystem } from "langium"
import { parseDocument } from "langium/test"
import type { Program } from "../generated/ast.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const services = createEligianServices(EmptyFileSystem).Eligian

function loadFixture(filename: string): string {
  const path = join(__dirname, "__fixtures__", filename)
  return readFileSync(path, "utf-8")
}

async function parseEligian(text: string): Promise<Program> {
  const document = await parseDocument(services, text)
  return document.parseResult.value as Program
}

describe("Eligian Grammar - Parsing", () => {
  describe("Timeline parsing", () => {
    test("should parse video timeline with source", async () => {
      const program = await parseEligian('timeline video from "video.mp4"')

      expect(program.elements).toHaveLength(1)
      const timeline = program.elements[0]
      expect(timeline.$type).toBe("Timeline")
      expect(timeline).toHaveProperty("provider", "video")
      expect(timeline).toHaveProperty("source")
    })

    test("should parse audio timeline with source", async () => {
      const program = await parseEligian('timeline audio from "audio.mp3"')

      expect(program.elements).toHaveLength(1)
      const timeline = program.elements[0]
      expect(timeline.$type).toBe("Timeline")
      expect(timeline).toHaveProperty("provider", "audio")
    })

    test("should parse raf timeline without source", async () => {
      const program = await parseEligian("timeline raf")

      expect(program.elements).toHaveLength(1)
      const timeline = program.elements[0]
      expect(timeline.$type).toBe("Timeline")
      expect(timeline).toHaveProperty("provider", "raf")
    })

    test("should parse custom timeline", async () => {
      const program = await parseEligian("timeline custom")

      expect(program.elements).toHaveLength(1)
      const timeline = program.elements[0]
      expect(timeline.$type).toBe("Timeline")
      expect(timeline).toHaveProperty("provider", "custom")
    })
  })

  describe("Event parsing", () => {
    test("should parse simple event with time range", async () => {
      const program = await parseEligian(`
        timeline raf
        event intro at 0..5 {
          show #title
        }
      `)

      expect(program.elements).toHaveLength(2)
      const event = program.elements[1]
      expect(event.$type).toBe("Event")
      expect(event).toHaveProperty("name", "intro")
      expect(event).toHaveProperty("timeRange")
    })

    test("should parse event with multiple actions", async () => {
      const program = await parseEligian(`
        timeline raf
        event intro at 0..5 {
          show #title
          show #subtitle
          hide #footer
        }
      `)

      const event = program.elements[1]
      expect(event.$type).toBe("Event")
      expect(event).toHaveProperty("actions")
      expect((event as any).actions).toHaveLength(3)
    })

    test("should parse event with time expressions", async () => {
      const program = await parseEligian(`
        timeline raf
        event test at 5 + 2..10 * 2 {
          show #content
        }
      `)

      const event = program.elements[1]
      expect(event.$type).toBe("Event")
      expect(event).toHaveProperty("timeRange")
    })
  })

  describe("Action parsing", () => {
    test("should parse show action with selector", async () => {
      const program = await parseEligian(`
        timeline raf
        event test at 0..5 {
          show #title
        }
      `)

      const event = program.elements[1] as any
      expect(event.actions[0].$type).toBe("ShowAction")
      expect(event.actions[0].target.$type).toBe("IdSelector")
    })

    test("should parse hide action with class selector", async () => {
      const program = await parseEligian(`
        timeline raf
        event test at 0..5 {
          hide .popup
        }
      `)

      const event = program.elements[1] as any
      expect(event.actions[0].$type).toBe("HideAction")
      expect(event.actions[0].target.$type).toBe("ClassSelector")
    })

    test("should parse animate action with element selector", async () => {
      const program = await parseEligian(`
        timeline raf
        event test at 0..5 {
          animate div with fadeIn(500)
        }
      `)

      const event = program.elements[1] as any
      expect(event.actions[0].$type).toBe("AnimateAction")
      expect(event.actions[0].target.$type).toBe("ElementSelector")
    })

    test("should parse trigger action", async () => {
      const program = await parseEligian(`
        timeline raf
        event test at 0..5 {
          trigger playAnimation
        }
      `)

      const event = program.elements[1] as any
      expect(event.actions[0].$type).toBe("TriggerAction")
      expect(event.actions[0]).toHaveProperty("actionName", "playAnimation")
    })
  })

  describe("Action definition parsing", () => {
    test("should parse action definition without parameters", async () => {
      const program = await parseEligian(`
        action showTitle() {
          on #title {
            addClass("visible")
          }
        }
      `)

      expect(program.elements).toHaveLength(1)
      const action = program.elements[0]
      expect(action.$type).toBe("ActionDefinition")
      expect(action).toHaveProperty("name", "showTitle")
      expect((action as any).parameters).toHaveLength(0)
    })

    test("should parse action definition with parameters", async () => {
      const program = await parseEligian(`
        action fadeIn(element, duration = 500) {
          on element {
            addClass("fade-in")
            animate(duration)
          }
        }
      `)

      const action = program.elements[0] as any
      expect(action.$type).toBe("ActionDefinition")
      expect(action.parameters).toHaveLength(2)
      expect(action.parameters[0].name).toBe("element")
      expect(action.parameters[1].name).toBe("duration")
    })

    test("should parse action call", async () => {
      const program = await parseEligian(`
        action fadeIn(element) {
          on element {
            addClass("fade-in")
          }
        }

        timeline raf
        event test at 0..5 {
          fadeIn(#title)
        }
      `)

      expect(program.elements).toHaveLength(3)
      const event = program.elements[2] as any
      expect(event.actions[0].$type).toBe("ActionCall")
    })
  })

  describe("Fixture files", () => {
    test("should parse simple-timeline.eligian", async () => {
      const source = loadFixture("valid/simple-timeline.eligian")
      const program = await parseEligian(source)

      expect(program.elements.length).toBeGreaterThan(0)
      const timeline = program.elements.find((e: any) => e.$type === "Timeline")
      expect(timeline).toBeDefined()
    })

    test("should parse action-definition.eligian", async () => {
      const source = loadFixture("valid/action-definition.eligian")
      const program = await parseEligian(source)

      const actions = program.elements.filter((e: any) => e.$type === "ActionDefinition")
      expect(actions.length).toBeGreaterThan(0)
    })

    test("should parse video-annotation.eligian", async () => {
      const source = loadFixture("valid/video-annotation.eligian")
      const program = await parseEligian(source)

      const timeline = program.elements.find((e: any) => e.$type === "Timeline")
      expect(timeline).toBeDefined()
      expect((timeline as any).provider).toBe("video")
    })

    test("should parse presentation.eligian", async () => {
      const source = loadFixture("valid/presentation.eligian")
      const program = await parseEligian(source)

      expect(program.elements.length).toBeGreaterThan(5)
    })
  })

  describe("Error recovery", () => {
    test("should handle syntax errors gracefully", async () => {
      const source = loadFixture("invalid/syntax-errors.eligian")
      const document = await parseDocument(services, source)

      // Should have parse errors
      expect(document.parseResult.lexerErrors.length + document.parseResult.parserErrors.length).toBeGreaterThan(0)
    })
  })
})
