import { useEffect, useMemo, useRef, useState } from 'react'
import { loadConfig } from '../lib/config'
import { createFormModel, createPreviewFormModel } from '../lib/create-model'
import { isStoredVault, openProfile, plaintextVault, sealProfile, type StoredVault } from '../lib/crypto'
import { EMPTY_LEDGER, normalizeLedger, recordInference, type Ledger } from '../lib/ledger'
import { matchVault } from '../lib/match'
import type { FormModel } from '../lib/model'
import { detectReadiness, downloadLanguageModel, type ModelReadiness } from '../lib/readiness'
import { createKv, STORAGE_KEYS } from '../lib/store'
import type { Checklist, FieldContext, ModelAnswer, PageScan, Profile, RunMode, VaultMatch } from '../lib/types'
import { demoProfile, emptyProfile, normalizeProfile, VAULT_GROUPS, VAULT_LABELS } from '../lib/vault'
import { translate, type CopyKey, type Locale } from './copy'
import { createTransport } from './transport'
import './styles.css'

type Settings = { neverCloud: boolean; locale: Locale; onboarded: boolean }

const DEFAULT_SETTINGS: Settings = { neverCloud: false, locale: 'en', onboarded: false }

type Consent =
  | { kind: 'text'; field: FieldContext }
  | { kind: 'page'; title: string; fields: FieldContext[] }
  | { kind: 'image' }

type FieldView =
  | { status: 'idle' }
  | { status: 'loading'; field: FieldContext }
  | { status: 'wait'; field: FieldContext }
  | { status: 'blocked'; field: FieldContext }
  | { status: 'ready'; field: FieldContext; answer: ModelAnswer<import('../lib/types').FieldExplanation>; match: VaultMatch | null }
  | { status: 'error'; field: FieldContext; message: string }

function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS
  const record = value as Partial<Settings>
  return {
    neverCloud: Boolean(record.neverCloud),
    locale: record.locale === 'id' ? 'id' : 'en',
    onboarded: Boolean(record.onboarded),
  }
}

function decide(settings: Settings, readiness: ModelReadiness, kind: FormModel['kind']): RunMode | 'need-consent' | 'blocked' | 'wait' {
  if (kind === 'mock') return 'only-device'
  if (readiness.state === 'checking') return 'wait'
  if (settings.neverCloud) return readiness.state === 'available' ? 'only-device' : 'blocked'
  if (readiness.state === 'available') return 'prefer-device'
  return 'need-consent'
}

function statusKey(state: ModelReadiness['state']): CopyKey {
  if (state === 'available') return 'statusAvailable'
  if (state === 'downloadable') return 'statusDownloadable'
  if (state === 'downloading') return 'statusDownloading'
  if (state === 'unavailable') return 'statusUnavailable'
  return 'statusChecking'
}

function Seal() {
  return (
    <svg className="seal" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="6" y="8" width="46" height="50" fill="#f4f0e6" stroke="#1a2330" strokeWidth="2" />
      <path d="M40 8h12v12H40z" fill="#e7e0d2" stroke="#1a2330" strokeWidth="2" />
      <path d="M14 28h22M14 36h18M14 44h16" stroke="#1a2330" strokeWidth="2" />
      <circle cx="46" cy="46" r="8" fill="#8e1e24" />
    </svg>
  )
}

export function App() {
  const transport = useMemo(() => createTransport(), [])
  const kv = useMemo(() => createKv(), [])
  const preview = document.documentElement.hasAttribute('data-fw-preview')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ledger, setLedger] = useState<Ledger>(EMPTY_LEDGER)
  const [vault, setVault] = useState<StoredVault | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [model, setModel] = useState<FormModel | null>(null)
  const [readiness, setReadiness] = useState<ModelReadiness>({ state: 'checking', detail: '' })
  const [view, setView] = useState<'field' | 'page' | 'vault' | 'settings'>('field')
  const [showSetup, setShowSetup] = useState(false)
  const [fieldView, setFieldView] = useState<FieldView>({ status: 'idle' })
  const [checklist, setChecklist] = useState<ModelAnswer<Checklist> | null>(null)
  const [scan, setScan] = useState<ModelAnswer<PageScan> | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [consent, setConsent] = useState<Consent | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [tokenDraft, setTokenDraft] = useState('')
  const [live, setLive] = useState('')
  const ticket = useRef(0)
  const declineRef = useRef<HTMLButtonElement>(null)
  const latest = useRef({ settings, profile, readiness, model, vault, ledger })
  latest.current = { settings, profile, readiness, model, vault, ledger }

  const t = (key: CopyKey) => translate(settings.locale, key)

  useEffect(() => {
    document.documentElement.lang = settings.locale === 'id' ? 'id' : 'en'
  }, [settings.locale])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const [storedSettings, storedLedger, storedVault, storedToken] = await Promise.all([
          kv.get<unknown>(STORAGE_KEYS.settings),
          kv.get<unknown>(STORAGE_KEYS.ledger),
          kv.get<unknown>(STORAGE_KEYS.vault),
          kv.get<string>(STORAGE_KEYS.debugToken),
        ])
        if (cancel) return
        const nextSettings = normalizeSettings(storedSettings)
        setSettings(nextSettings)
        setLedger(normalizeLedger(storedLedger))
        setTokenDraft(storedToken || '')
        if (isStoredVault(storedVault)) {
          setVault(storedVault)
          if (!storedVault.encrypted) setProfile(normalizeProfile(storedVault.profile))
        }
        const nextModel = preview ? createPreviewFormModel() : await createFormModel(storedToken)
        if (cancel) return
        setModel(nextModel)
        setReadiness(await detectReadiness())
      } catch (error) {
        if (!cancel) setBootError(error instanceof Error ? error.message : 'Could not open Formwhisper.')
      }
    })()
    return () => {
      cancel = true
    }
  }, [kv, preview])

  async function remember(source: ModelAnswer<unknown>['source']) {
    if (source === 'PREVIEW') return
    const next = recordInference(latest.current.ledger, source)
    latest.current = { ...latest.current, ledger: next }
    setLedger(next)
    await kv.set(STORAGE_KEYS.ledger, next)
  }

  async function persistSettings(next: Settings) {
    setSettings(next)
    await kv.set(STORAGE_KEYS.settings, next)
  }

  async function persistProfile(next: Profile, encryptedWith?: string) {
    const phrase = encryptedWith ?? passphrase
    const stored =
      latest.current.vault?.encrypted && phrase
        ? await sealProfile(next, phrase)
        : plaintextVault(next)
    setProfile(next)
    setVault(stored)
    await kv.set(STORAGE_KEYS.vault, stored)
  }

  async function explain(field: FieldContext, mode: RunMode) {
    const current = latest.current.model
    if (!current) return
    const id = ++ticket.current
    setFieldView({ status: 'loading', field })
    setLive(t('loading'))
    try {
      const answer = await current.explainField(field, mode)
      if (id !== ticket.current) return
      const match = matchVault(answer.data.semanticType, latest.current.profile)
      setFieldView({ status: 'ready', field, answer, match })
      setLive(answer.data.explanation)
      await remember(answer.source)
    } catch (error) {
      if (id !== ticket.current) return
      const message = error instanceof Error ? error.message : 'The request failed.'
      setFieldView({ status: 'error', field, message })
      setLive(message)
    }
  }

  function routeField(field: FieldContext) {
    const current = latest.current
    if (!current.model || !current.settings.onboarded) return
    const choice = decide(current.settings, current.readiness, current.model.kind)
    if (choice === 'wait') {
      setFieldView({ status: 'wait', field })
      return
    }
    if (choice === 'blocked') {
      setFieldView({ status: 'blocked', field })
      setLive(t('cloudOff'))
      return
    }
    if (choice === 'need-consent') {
      setConsent({ kind: 'text', field })
      setFieldView({ status: 'idle' })
      return
    }
    void explain(field, choice)
  }

  useEffect(() => {
    return transport.listen((field) => {
      routeField(field)
    })
    // routeField reads the latest ref; the subscription itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport])

  useEffect(() => {
    if (!consent) return
    declineRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConsent(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [consent])

  async function acceptConsent() {
    const pending = consent
    setConsent(null)
    if (!pending || !model) return
    if (pending.kind === 'text') await explain(pending.field, 'only-cloud')
    if (pending.kind === 'page') await runChecklist(pending.fields, pending.title, 'only-cloud')
    if (pending.kind === 'image') await runScan('only-cloud')
  }

  async function runChecklist(fields: FieldContext[], title: string, mode: RunMode) {
    if (!model) return
    setNotice(t('loading'))
    try {
      const answer = await model.checklist(fields, title, mode)
      setChecklist(answer)
      setView('page')
      setLive(answer.data.summary)
      await remember(answer.source)
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The request failed.')
    }
  }

  async function onReadPage() {
    if (!model) return
    try {
      const scanned = await transport.scan()
      const choice = decide(settings, readiness, model.kind)
      if (choice === 'need-consent') {
        setConsent({ kind: 'page', title: scanned.title, fields: scanned.fields })
        return
      }
      if (choice === 'blocked' || choice === 'wait') {
        setNotice(choice === 'wait' ? t('waiting') : t('cloudOff'))
        return
      }
      await runChecklist(scanned.fields, scanned.title, choice)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The page could not be read.')
    }
  }

  async function runScan(mode: RunMode) {
    if (!model) return
    try {
      const image = await transport.capture()
      if (!image && model.kind === 'hybrid') {
        setNotice(t('captureMissing'))
        return
      }
      if (image) setShot(image)
      const answer = await model.readImage(image || '', mode)
      setScan(answer)
      setView('page')
      setLive(answer.data.pageSummary)
      await remember(answer.source)
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The picture could not be read.')
    }
  }

  function onReadVisible() {
    if (!model) return
    const choice = decide(settings, readiness, model.kind)
    if (choice === 'need-consent') {
      setConsent({ kind: 'image' })
      return
    }
    if (choice === 'blocked' || choice === 'wait') {
      setNotice(choice === 'wait' ? t('waiting') : t('cloudOff'))
      return
    }
    void runScan(choice)
  }

  async function onFill(match: VaultMatch, fieldId: string) {
    const ok = await transport.fill(fieldId, match.value)
    setNotice(ok ? t('filled') : t('fillFailed'))
    setLive(ok ? t('filled') : t('fillFailed'))
  }

  async function onDownload() {
    setProgress(0)
    try {
      const pending = model?.prepareDevice
        ? model.prepareDevice((ratio) => setProgress(ratio))
        : downloadLanguageModel((ratio) => setProgress(ratio))
      await pending
      setReadiness(await detectReadiness())
      setProgress(null)
    } catch (error) {
      setProgress(null)
      setNotice(error instanceof Error ? error.message : 'The download did not start.')
    }
  }

  const setupOpen = showSetup || !settings.onboarded

  return (
    <div className="shell">
      <header className="mast">
        <div>
          <p className="kicker">{t('kicker')}</p>
          <h1 className="word">Formwhisper</h1>
          <p className="status">{t(statusKey(readiness.state))}</p>
        </div>
        <Seal />
      </header>
      <nav className="tabs" aria-label="Formwhisper">
        {(['field', 'page', 'vault', 'settings'] as const).map((id) => (
          <button key={id} type="button" aria-selected={view === id} onClick={() => setView(id)}>
            {t(id === 'field' ? 'navField' : id === 'page' ? 'navPage' : id === 'vault' ? 'navVault' : 'navSettings')}
          </button>
        ))}
      </nav>
      <main className="sheet">
        <p className="live" aria-live="polite">{live}</p>
        {bootError ? <p className="error" role="alert">{bootError}</p> : null}
        {!model && !bootError ? <p>{t('boot')}</p> : null}
        {model && setupOpen ? (
          <section>
            <h2>{t('onboardTitle')}</h2>
            <p>{t('onboardBody')}</p>
            <h3 className="group-label">{t('flagTitle')}</h3>
            <p>{t('flagBody')}</p>
            <p>{readiness.detail}</p>
            {progress !== null ? (
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            ) : null}
            <div className="actions">
              <button className="ink" type="button" onClick={() => void onDownload()} disabled={readiness.state === 'unavailable'}>
                {progress !== null ? `${t('downloading')} ${Math.round((progress || 0) * 100)}%` : t('download')}
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setShowSetup(false)
                  void persistSettings({ ...settings, onboarded: true })
                }}
              >
                {readiness.state === 'available' ? t('continue') : t('skip')}
              </button>
            </div>
          </section>
        ) : null}
        {model && !setupOpen && view === 'field' ? (
          <FieldBody
            view={fieldView}
            t={t}
            onFill={(match, fieldId) => void onFill(match, fieldId)}
            vaultLocked={Boolean(vault?.encrypted && !profile)}
          />
        ) : null}
        {model && !setupOpen && view === 'page' ? (
          <PageBody
            t={t}
            checklist={checklist}
            scan={scan}
            shot={shot}
            notice={notice}
            onReadPage={() => void onReadPage()}
            onReadVisible={onReadVisible}
          />
        ) : null}
        {model && !setupOpen && view === 'vault' ? (
          <VaultBody
            t={t}
            vault={vault}
            profile={profile}
            notice={notice}
            onUnlock={async (phrase) => {
              if (!vault?.encrypted) return
              try {
                const opened = await openProfile(vault, phrase)
                setPassphrase(phrase)
                setProfile(opened)
                setNotice('')
              } catch (error) {
                setNotice(error instanceof Error ? error.message : t('wrongPass'))
              }
            }}
            onLock={() => {
              setProfile(null)
              setPassphrase('')
            }}
            onEdit={setProfile}
            onCommit={(next) => void persistProfile(next)}
            onEncrypt={async (phrase) => {
              const base = profile ?? emptyProfile()
              const stored = await sealProfile(base, phrase)
              setPassphrase(phrase)
              setProfile(base)
              setVault(stored)
              await kv.set(STORAGE_KEYS.vault, stored)
            }}
            onDemo={() => void persistProfile(demoProfile())}
            onClear={async () => {
              setProfile(null)
              setVault(null)
              setPassphrase('')
              await kv.remove(STORAGE_KEYS.vault)
            }}
          />
        ) : null}
        {model && !setupOpen && view === 'settings' ? (
          <SettingsBody
            t={t}
            settings={settings}
            model={model}
            tokenDraft={tokenDraft}
            notice={notice}
            onNeverCloud={(neverCloud) => void persistSettings({ ...settings, neverCloud })}
            onLocale={(locale) => void persistSettings({ ...settings, locale })}
            onToken={setTokenDraft}
            onSaveToken={async () => {
              await kv.set(STORAGE_KEYS.debugToken, tokenDraft.trim())
              setNotice(t('tokenSaved'))
            }}
            onSetup={() => setShowSetup(true)}
          />
        ) : null}
        {consent ? (
          <div className="consent" role="dialog" aria-modal="true" aria-labelledby="consent-title">
            <h2 id="consent-title">{consent.kind === 'image' ? t('imageConsentTitle') : t('consentTitle')}</h2>
            <p>
              {consent.kind === 'image' ? t('imageConsentBody') : consent.kind === 'page' ? t('consentPage') : t('consentBody')}
            </p>
            <div className="actions">
              <button ref={declineRef} className="ghost" type="button" onClick={() => setConsent(null)}>
                {t('consentStay')}
              </button>
              <button className="ink" type="button" onClick={() => void acceptConsent()}>
                {consent.kind === 'image' ? t('consentSendImage') : consent.kind === 'page' ? t('consentSendPage') : t('consentSend')}
              </button>
            </div>
          </div>
        ) : null}
      </main>
      <footer className="ledger">
        <div>
          <span>{t('ledgerDevice')}</span>
          <strong>{ledger.onDevice}</strong>
        </div>
        <div>
          <span>{t('ledgerCloud')}</span>
          <strong>{ledger.inCloud}</strong>
        </div>
        <div>
          <span>{t('ledgerPersonal')}</span>
          <strong>{t('ledgerBytes')}</strong>
        </div>
      </footer>
    </div>
  )
}

function FieldBody({
  view,
  t,
  onFill,
  vaultLocked,
}: {
  view: FieldView
  t: (key: CopyKey) => string
  onFill: (match: VaultMatch, fieldId: string) => void
  vaultLocked: boolean
}) {
  if (view.status === 'idle') {
    return (
      <section>
        <h2>{t('emptyTitle')}</h2>
        <p>{t('emptyBody')}</p>
      </section>
    )
  }
  if (view.status === 'loading' || view.status === 'wait') {
    return (
      <section>
        <h2>{view.field.label || view.field.name}</h2>
        <p>{view.status === 'wait' ? t('waiting') : t('loading')}</p>
      </section>
    )
  }
  if (view.status === 'blocked') {
    return (
      <section>
        <h2>{view.field.label || view.field.name}</h2>
        <p className="error" role="alert">{t('cloudOff')}</p>
      </section>
    )
  }
  if (view.status === 'error') {
    return (
      <section>
        <h2>{view.field.label || view.field.name}</h2>
        <p className="error" role="alert">{view.message}</p>
      </section>
    )
  }
  const { answer, field, match } = view
  const badgeClass = answer.source === 'IN_CLOUD' ? 'badge cloud' : answer.source === 'PREVIEW' ? 'badge preview' : 'badge'
  return (
    <section className="answer">
      <div className="row-meta">
        <span className={badgeClass}>{answer.source === 'ON_DEVICE' ? 'ON_DEVICE' : answer.source === 'IN_CLOUD' ? 'IN_CLOUD' : 'PREVIEW'}</span>
        <span className={field.required ? 'flag' : 'quiet'}>{field.required ? t('required') : t('optional')}</span>
        <span className="quiet">{answer.data.sensitivity === 'identity' ? t('identity') : t('ordinary')}</span>
      </div>
      <h2>{field.label || field.name || 'Field'}</h2>
      <p>{answer.data.explanation}</p>
      {answer.source === 'PREVIEW' ? <p className="quiet">{t('previewNote')}</p> : null}
      <h3>{t('whyAsked')}</h3>
      <p>{answer.data.whyAsked}</p>
      {answer.data.commonMistakes.length ? (
        <>
          <h3>{t('mistakes')}</h3>
          <ul>
            {answer.data.commonMistakes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="suggest">
        <h3>{t('suggested')}</h3>
        {match ? (
          <>
            <p>
              {VAULT_LABELS[match.key]} <strong>{match.value}</strong>
            </p>
            <button className="ink" type="button" onClick={() => onFill(match, field.fieldId)}>
              {t('fill')}
            </button>
          </>
        ) : (
          <p className="quiet">{vaultLocked ? t('unlockToFill') : t('noMatch')}</p>
        )}
      </div>
    </section>
  )
}

function PageBody({
  t,
  checklist,
  scan,
  shot,
  notice,
  onReadPage,
  onReadVisible,
}: {
  t: (key: CopyKey) => string
  checklist: ModelAnswer<Checklist> | null
  scan: ModelAnswer<PageScan> | null
  shot: string | null
  notice: string
  onReadPage: () => void
  onReadVisible: () => void
}) {
  return (
    <section>
      <h2>{t('navPage')}</h2>
      <p>{t('pageLead')}</p>
      <div className="actions">
        <button className="ink" type="button" onClick={onReadPage}>{t('readPage')}</button>
        <button className="ghost" type="button" onClick={onReadVisible}>{t('readVisible')}</button>
      </div>
      <p className="quiet">{t('scanLead')}</p>
      {notice ? <p role="status">{notice}</p> : null}
      {!checklist && !scan ? <p>{t('pageEmpty')}</p> : null}
      {checklist ? (
        <article>
          <div className="row-meta">
            <span className={checklist.source === 'PREVIEW' ? 'badge preview' : checklist.source === 'IN_CLOUD' ? 'badge cloud' : 'badge'}>
              {checklist.source === 'ON_DEVICE' ? 'ON_DEVICE' : checklist.source === 'IN_CLOUD' ? 'IN_CLOUD' : 'PREVIEW'}
            </span>
          </div>
          <h2>{checklist.data.formTitle}</h2>
          <p>{checklist.data.summary}</p>
          {checklist.source === 'PREVIEW' ? <p className="quiet">{t('previewNote')}</p> : null}
          {checklist.data.items.map((item) => (
            <div className="item" key={`${item.label}-${item.plainMeaning.slice(0, 24)}`}>
              <h3>
                {item.label} {item.required ? <span className="flag">{t('required')}</span> : null}
              </h3>
              <p>{item.plainMeaning}</p>
            </div>
          ))}
          <h3 className="group-label">{t('documents')}</h3>
          <ul>
            {checklist.data.documentsToGather.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3 className="group-label">{t('beforeSubmit')}</h3>
          <ul>
            {checklist.data.beforeYouSubmit.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      ) : null}
      {scan ? (
        <article>
          <hr className="rule" />
          <div className="row-meta">
            <span className={scan.source === 'PREVIEW' ? 'badge preview' : scan.source === 'IN_CLOUD' ? 'badge cloud' : 'badge'}>
              {scan.source === 'ON_DEVICE' ? 'ON_DEVICE' : scan.source === 'IN_CLOUD' ? 'IN_CLOUD' : 'PREVIEW'}
            </span>
          </div>
          {shot ? <img className="thumb" alt="Visible tab" src={shot.startsWith('data:') ? shot : `data:image/jpeg;base64,${shot}`} /> : null}
          <p>{scan.data.pageSummary}</p>
          {scan.source === 'PREVIEW' ? <p className="quiet">{t('scanPreview')}</p> : null}
          {scan.data.fields.map((item) => (
            <div className="item" key={item.label}>
              <h3>{item.label}</h3>
              <p>{item.plainMeaning}</p>
              <p className="quiet">{item.commonMistake}</p>
            </div>
          ))}
          <h3 className="group-label">{t('cautions')}</h3>
          <ul>
            {scan.data.cautions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  )
}

function VaultBody({
  t,
  vault,
  profile,
  notice,
  onUnlock,
  onLock,
  onEdit,
  onCommit,
  onEncrypt,
  onDemo,
  onClear,
}: {
  t: (key: CopyKey) => string
  vault: StoredVault | null
  profile: Profile | null
  notice: string
  onUnlock: (phrase: string) => Promise<void>
  onLock: () => void
  onEdit: (profile: Profile) => void
  onCommit: (profile: Profile) => void
  onEncrypt: (phrase: string) => Promise<void>
  onDemo: () => void
  onClear: () => Promise<void>
}) {
  const [phrase, setPhrase] = useState('')
  const locked = Boolean(vault?.encrypted && !profile)
  return (
    <section>
      <h2>{t('navVault')}</h2>
      <p>{t('vaultIntro')}</p>
      {notice ? <p role="status">{notice}</p> : null}
      {locked ? (
        <form
          className="field"
          onSubmit={(event) => {
            event.preventDefault()
            void onUnlock(phrase)
          }}
        >
          <p>{t('vaultLocked')}</p>
          <label>
            <span>{t('passphrase')}</span>
            <input type="password" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="current-password" />
          </label>
          <button className="ink" type="submit">{t('unlock')}</button>
        </form>
      ) : (
        <>
          <p className="quiet">{t('saveNote')}</p>
          {VAULT_GROUPS.map((group) => (
            <div key={group.id}>
              <h3 className="group-label">{t(group.id === 'identity' ? 'groupIdentity' : group.id === 'address' ? 'groupAddress' : 'groupPapers')}</h3>
              {(profile ?? emptyProfile()) &&
                group.keys.map((key) => (
                  <label className="field" key={key}>
                    <span>{VAULT_LABELS[key]}</span>
                    <input
                      value={(profile ?? emptyProfile())[key]}
                      autoComplete="off"
                      onChange={(event) => onEdit({ ...(profile ?? emptyProfile()), [key]: event.target.value })}
                      onBlur={(event) => onCommit({ ...(profile ?? emptyProfile()), [key]: event.target.value })}
                    />
                  </label>
                ))}
            </div>
          ))}
          <div className="actions">
            {vault?.encrypted ? (
              <button className="ghost" type="button" onClick={onLock}>{t('lock')}</button>
            ) : null}
            <button className="ghost" type="button" onClick={onDemo}>{t('loadDemo')}</button>
            <button className="texty" type="button" onClick={() => void onClear()}>{t('clearVault')}</button>
          </div>
          {!vault?.encrypted ? (
            <form
              className="field"
              onSubmit={(event) => {
                event.preventDefault()
                void onEncrypt(phrase)
              }}
            >
              <p className="quiet">{t('encryptHelp')}</p>
              <label>
                <span>{t('passphrase')}</span>
                <input type="password" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="new-password" />
              </label>
              <button className="ink" type="submit">{t('encrypt')}</button>
            </form>
          ) : null}
        </>
      )}
    </section>
  )
}

function SettingsBody({
  t,
  settings,
  model,
  tokenDraft,
  notice,
  onNeverCloud,
  onLocale,
  onToken,
  onSaveToken,
  onSetup,
}: {
  t: (key: CopyKey) => string
  settings: Settings
  model: FormModel
  tokenDraft: string
  notice: string
  onNeverCloud: (value: boolean) => void
  onLocale: (locale: Locale) => void
  onToken: (value: string) => void
  onSaveToken: () => Promise<void>
  onSetup: () => void
}) {
  const cloudName = model.kind === 'hybrid' ? loadConfig()?.cloudModel || 'gemini-4-hydrogen' : 'preview'
  return (
    <section>
      <h2>{t('navSettings')}</h2>
      <p>{model.kind === 'hybrid' ? t('providerHybrid') : t('providerMock')}</p>
      <p className="quiet">
        {t('cloudModel')}: {cloudName}
      </p>
      {notice ? <p role="status">{notice}</p> : null}
      <label className="check">
        <input type="checkbox" checked={settings.neverCloud} onChange={(event) => onNeverCloud(event.target.checked)} />
        <span>
          <strong>{t('neverCloud')}</strong>
          <br />
          {t('neverCloudHelp')}
        </span>
      </label>
      <label className="field">
        <span>{t('language')}</span>
        <select value={settings.locale} onChange={(event) => onLocale(event.target.value === 'id' ? 'id' : 'en')}>
          <option value="en">English</option>
          <option value="id">Bahasa Indonesia</option>
        </select>
      </label>
      <p className="quiet">{t('languageHelp')}</p>
      <label className="field">
        <span>{t('token')}</span>
        <input type="password" value={tokenDraft} autoComplete="off" onChange={(event) => onToken(event.target.value)} />
      </label>
      <p className="quiet">{t('tokenHelp')}</p>
      <div className="actions">
        <button className="ink" type="button" onClick={() => void onSaveToken()}>{t('saveToken')}</button>
        <button className="ghost" type="button" onClick={onSetup}>{t('reopen')}</button>
        <button className="texty" type="button" onClick={() => window.location.reload()}>{t('reload')}</button>
      </div>
    </section>
  )
}
