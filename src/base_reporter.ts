/*
 * @japa/base-reporter
 *
 * (c) Japa.dev
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import ms from 'ms'
import { cliui } from '@poppinss/cliui'
import { ErrorsPrinter } from '@japa/errors-printer'
import type { BaseReporterOptions } from './types.js'
import { Emitter, Runner } from '@japa/core'
import type {
  TestEndNode,
  SuiteEndNode,
  GroupEndNode,
  TestStartNode,
  RunnerEndNode,
  GroupStartNode,
  SuiteStartNode,
  RunnerStartNode,
} from '@japa/core/types'

/**
 * Base reporter to build custom reporters on top of
 */
export abstract class BaseReporter {
  #options: BaseReporterOptions

  /**
   * Reference to the tests runner. Available after the
   * boot method is invoked
   */
  runner!: Runner<any>

  /**
   * Path to the file for which the tests are getting executed
   */
  currentFileName?: string

  /**
   * Suite for which the tests are getting executed
   */
  currentSuiteName?: string

  /**
   * Collection of uncaught exceptions occurred during the
   * tests
   */
  uncaughtExceptions: { phase: 'test'; error: Error }[] = []

  constructor(
    options: Partial<BaseReporterOptions> = {},
    public ui: ReturnType<typeof cliui> = cliui()
  ) {
    this.#options = { stackLinesCount: options.stackLinesCount || 5 }
  }

  /**
   * Logger to log messages
   */
  get logger() {
    return this.ui.logger
  }

  /**
   * Add colors to console messages
   */
  get colors() {
    return this.ui.colors
  }

  /**
   * Print the aggregate count
   */
  #printKeyValuePair(key: string, value: string, whitespaceLength: number) {
    this.logger.log(`${this.colors.dim(`${key.padEnd(whitespaceLength + 2)} : `)}${value}`)
  }

  /**
   * Handlers to capture events
   */
  protected onTestStart(_: TestStartNode) {}
  protected onTestEnd(_: TestEndNode) {}

  protected onGroupStart(_: GroupStartNode) {}
  protected onGroupEnd(_: GroupEndNode) {}

  protected onSuiteStart(_: SuiteStartNode) {}
  protected onSuiteEnd(_: SuiteEndNode) {}

  protected async start(_: RunnerStartNode) {}
  protected async end(_: RunnerEndNode) {}

  /**
   * Pretty print aggregates
   */
  #printAggregates(summary: ReturnType<Runner<any>['getSummary']>) {
    const [tests, time]: string[][] = [[], []]

    /**
     * Set value for time row
     */
    time.push(this.colors.dim(ms(summary.duration)))

    /**
     * Set value for tests row
     */
    if (summary.aggregates.passed) {
      tests.push(this.colors.green(`${summary.aggregates.passed} passed`))
    }
    if (summary.aggregates.failed) {
      tests.push(this.colors.red(`${summary.aggregates.failed} failed`))
    }
    if (summary.aggregates.todo) {
      tests.push(this.colors.cyan(`${summary.aggregates.todo} todo`))
    }
    if (summary.aggregates.skipped) {
      tests.push(this.colors.yellow(`${summary.aggregates.skipped} skipped`))
    }
    if (summary.aggregates.regression) {
      tests.push(this.colors.magenta(`${summary.aggregates.regression} regression`))
    }

    const keysPadding = summary.aggregates.uncaughtExceptions ? 19 : 5
    this.#printKeyValuePair(
      'Tests',
      `${tests.join(', ')} ${this.colors.dim(`(${summary.aggregates.total})`)}`,
      keysPadding
    )
    this.#printKeyValuePair('Time', time.join(''), keysPadding)

    if (summary.aggregates.uncaughtExceptions) {
      this.#printKeyValuePair(
        'Uncaught exceptions',
        this.colors.red(String(summary.aggregates.uncaughtExceptions)),
        keysPadding
      )
    }
  }

  /**
   * Pretty print errors
   */
  async #printErrors(summary: ReturnType<Runner<any>['getSummary']>) {
    if (summary.failureTree.length || this.uncaughtExceptions.length) {
      this.logger.log('')
      this.logger.log('')
    }

    const errorPrinter = new ErrorsPrinter({
      stackLinesCount: this.#options.stackLinesCount,
    })

    /**
     * Printing the errors tree
     */
    for (let suite of summary.failureTree) {
      await errorPrinter.printErrors(suite.name, suite.errors)

      for (let testOrGroup of suite.children) {
        if (testOrGroup.type === 'group') {
          await errorPrinter.printErrors(testOrGroup.name, testOrGroup.errors)
          for (let test of testOrGroup.children) {
            await errorPrinter.printErrors(test.title, test.errors)
          }
        } else {
          await errorPrinter.printErrors(testOrGroup.title, testOrGroup.errors)
        }
      }
    }

    /**
     * Uncaught exceptions
     */
    await errorPrinter.printErrors('Uncaught exception', this.uncaughtExceptions)
  }

  /**
   * Print tests summary
   */
  async printSummary(summary: ReturnType<Runner<any>['getSummary']>) {
    this.logger.log('')

    if (summary.aggregates.total === 0 && !summary.hasError) {
      this.logger.log(this.colors.bgYellow().black(' NO TESTS EXECUTED '))
      return
    }

    if (summary.hasError) {
      this.logger.log(this.colors.bgRed().black(' FAILED '))
    } else {
      this.logger.log(this.colors.bgGreen().black(' PASSED '))
    }
    this.logger.log('')

    this.#printAggregates(summary)
    await this.#printErrors(summary)
  }

  /**
   * Invoked by the tests runner when tests are about to start
   */
  boot(runner: Runner<any>, emitter: Emitter) {
    this.runner = runner

    emitter.on('test:start', (payload) => {
      this.currentFileName = payload.meta.fileName
      this.onTestStart(payload)
    })

    emitter.on('test:end', (payload) => {
      this.onTestEnd(payload)
    })

    emitter.on('group:start', (payload) => {
      this.currentFileName = payload.meta.fileName
      this.onGroupStart(payload)
    })

    emitter.on('group:end', (payload) => {
      this.onGroupEnd(payload)
    })

    emitter.on('suite:start', (payload) => {
      this.currentSuiteName = payload.name
      this.onSuiteStart(payload)
    })

    emitter.on('suite:end', (payload) => {
      this.currentSuiteName = undefined
      this.onSuiteEnd(payload)
    })

    emitter.on('uncaught:exception', async (error) => {
      this.uncaughtExceptions.push({ phase: 'test', error })
    })

    emitter.on('runner:start', async (payload) => {
      await this.start(payload)
    })

    emitter.on('runner:end', async (payload) => {
      await this.end(payload)
    })
  }
}
