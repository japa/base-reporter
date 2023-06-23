/*
 * @japa/base-reporter
 *
 * (c) Japa.dev
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import {
  Test,
  Group,
  Suite,
  Runner,
  Refiner,
  Emitter,
  TestEndNode,
  GroupEndNode,
  GroupOptions,
  SuiteEndNode,
  TestStartNode,
  SuiteStartNode,
} from '@japa/core'

import { BaseReporter } from '../src/base_reporter.js'

test.group('Base reporter', () => {
  test('extend base reporter to create a custom reporter', async ({ assert }) => {
    assert.plan(1)

    class MyReporter extends BaseReporter {
      protected async start() {
        assert.isDefined(this.runner)
      }
    }

    const emitter = new Emitter()
    const runner = new Runner(emitter)
    runner.registerReporter((r, e) => new MyReporter({}).boot(r, e))

    await runner.start()
  })

  test('invoke handlers when suite, groups and tests are executed', async ({ assert }) => {
    assert.plan(10)

    class MyReporter extends BaseReporter {
      protected async start() {
        assert.isDefined(this.runner)
      }

      protected async end(): Promise<void> {
        const summary = this.runner.getSummary()
        assert.containsSubset(summary, {
          aggregates: {
            total: 1,
            failed: 0,
            passed: 0,
            regression: 0,
            skipped: 0,
            todo: 1,
            uncaughtExceptions: 0,
          },
          hasError: false,
          failureTree: [],
          failedTestsTitles: [],
        })
      }

      protected onTestStart(t: TestStartNode): void {
        assert.equal(t.title.expanded, '2 + 2')
      }

      protected onTestEnd(t: TestEndNode): void {
        assert.equal(t.title.expanded, '2 + 2')
        assert.isFalse(t.hasError)
      }

      protected onGroupStart(g: GroupOptions): void {
        assert.equal(g.title, 'default')
      }

      protected onGroupEnd(g: GroupEndNode): void {
        assert.equal(g.title, 'default')
        assert.isFalse(g.hasError)
      }

      protected onSuiteStart(s: SuiteStartNode): void {
        assert.equal(s.name, 'default')
      }

      protected onSuiteEnd(s: SuiteEndNode): void {
        assert.equal(s.name, 'default')
      }
    }

    const emitter = new Emitter()
    const runner = new Runner(emitter)
    const refiner = new Refiner()
    const suite = new Suite('default', emitter, refiner)
    const group = new Group('default', emitter, refiner)
    const t = new Test('2 + 2', {}, emitter, refiner, group)

    group.add(t)
    suite.add(group)
    runner.add(suite)

    runner.registerReporter((r, e) => new MyReporter({}).boot(r, e))
    await runner.start()
    await runner.exec()
    await runner.end()
  })
})
