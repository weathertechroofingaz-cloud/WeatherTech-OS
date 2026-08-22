import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const repository = readFileSync(join(cwd, "lib", "crm", "repository.ts"), "utf8");
const app = readFileSync(join(cwd, "components", "CrmApp.tsx"), "utf8");
const fieldOperations = readFileSync(
  join(cwd, "components", "FieldOperationsWorkspace.tsx"),
  "utf8",
);

function sourceSection(source, startMarker, endMarker) {
  const sectionStart = source.indexOf(startMarker);
  const sectionEnd = source.indexOf(endMarker, sectionStart);

  assert.ok(
    sectionStart >= 0 && sectionEnd > sectionStart,
    `${startMarker} source boundary must remain discoverable`,
  );

  return source.slice(sectionStart, sectionEnd);
}
const start = repository.indexOf("export async function createJobPhoto(");
const end = repository.indexOf("function buildInvoicePayload(", start);

assert.ok(start >= 0 && end > start, "createJobPhoto source boundary must remain discoverable");

const createJobPhoto = repository.slice(start, end);
const cancelStart = repository.indexOf(
  "async function cancelJobPhotoUploadAttempt(",
);
const cancelEnd = repository.indexOf(
  "async function hydrateRegisteredJobPhoto(",
  cancelStart,
);

assert.ok(
  cancelStart >= 0 && cancelEnd > cancelStart,
  "cancelJobPhotoUploadAttempt source boundary must remain discoverable",
);

const cancelJobPhotoUploadAttempt = repository.slice(cancelStart, cancelEnd);
const readinessSelect = createJobPhoto.indexOf(
  '.select("upload_operation_key, upload_request_fingerprint")',
);
const readinessLimit = createJobPhoto.indexOf(".limit(0)", readinessSelect);
const readinessGuard = createJobPhoto.indexOf(
  "if (schemaReadinessError)",
  readinessLimit,
);
const readinessError = createJobPhoto.indexOf(
  "Secure photo storage is not ready yet.",
  readinessGuard,
);
const beginReservation = createJobPhoto.indexOf(
  '"wtos_begin_job_photo_upload"',
  readinessError,
);
const committedReservation = createJobPhoto.indexOf(
  'reservation.state === "committed"',
  beginReservation,
);
const cancelingReservation = createJobPhoto.indexOf(
  'reservation.state === "canceling"',
  committedReservation,
);
const abortedReservation = createJobPhoto.indexOf(
  'reservation.state === "aborted"',
  cancelingReservation,
);
const upload = createJobPhoto.indexOf(
  ".upload(attempt.filePath, file",
  abortedReservation,
);
const registration = createJobPhoto.indexOf(
  "await tryRegisterJobPhoto(",
  upload,
);
const durableCancellation = createJobPhoto.indexOf(
  "await cancelJobPhotoUploadAttempt(",
  registration,
);

assert.ok(
  readinessSelect >= 0 &&
    readinessSelect < readinessLimit &&
    readinessLimit < readinessGuard &&
    readinessGuard < readinessError &&
    readinessError < beginReservation &&
    beginReservation < committedReservation &&
    committedReservation < cancelingReservation &&
    cancelingReservation < abortedReservation &&
    abortedReservation < upload &&
    upload < registration &&
    registration < durableCancellation,
  "Readiness must precede durable reservation, terminal-state handling, Storage upload, registration, and durable cancellation",
);
assert.equal(
  (createJobPhoto.slice(0, upload).match(/\.upload\(/g) ?? []).length,
  0,
  "Missing-schema or unconfirmed-reservation paths can call no Storage upload",
);
assert.ok(
  createJobPhoto.includes("buildJobPhotoUploadRpcArgs(normalizedInput, attempt)") &&
    repository.includes("target_upload_operation_key: attempt.operationKey") &&
    repository.includes(
      "target_upload_request_fingerprint: attempt.requestFingerprint",
    ) &&
    repository.includes("target_file_path: attempt.filePath") &&
    repository.includes(
      "target_recovery_lease_token: attempt.recoveryLeaseToken",
    ),
  "Reservation, registration, cancellation, heartbeat, and retry reuse one stable operation identity and browser lease",
);
assert.ok(
  createJobPhoto.includes("catch {\n    // Registration and durable cancellation below resolve ambiguous transport results.") &&
    !createJobPhoto.includes("if (!uploadError)") &&
    !createJobPhoto.includes("createdObjectThisAttempt"),
  "An ambiguous Storage transport result still proceeds through registration or durable cancellation",
);

const cancelRpc = cancelJobPhotoUploadAttempt.indexOf(
  '"wtos_cancel_job_photo_upload"',
);
const committedBeforeCleanup = cancelJobPhotoUploadAttempt.indexOf(
  'cancellation.state === "committed"',
  cancelRpc,
);
const exactRemove = cancelJobPhotoUploadAttempt.indexOf(
  ".remove([attempt.filePath])",
  committedBeforeCleanup,
);
const confirmAbort = cancelJobPhotoUploadAttempt.indexOf(
  '"wtos_confirm_job_photo_upload_abort"',
  exactRemove,
);

assert.ok(
  cancelRpc >= 0 &&
    cancelRpc < committedBeforeCleanup &&
    committedBeforeCleanup < exactRemove &&
    exactRemove < confirmAbort,
  "Cleanup durably tombstones the attempt before exact Storage removal and confirms abort only afterward",
);
assert.ok(
  cancelJobPhotoUploadAttempt.includes("exactCleanupFailed = Boolean(error)") &&
    cancelJobPhotoUploadAttempt.indexOf("exactCleanupFailed = Boolean(error)") <
      confirmAbort,
  "Ambiguous exact-remove results still run the durable abort confirmation",
);
assert.ok(
  cancelJobPhotoUploadAttempt.indexOf('cancellation.state === "committed"') <
      exactRemove &&
    cancelJobPhotoUploadAttempt.indexOf('confirmation.state === "committed"') >
      confirmAbort &&
    cancelJobPhotoUploadAttempt.includes("recoverCommittedJobPhoto("),
  "Committed attempts recover metadata and are never removed as canceled uploads",
);
assert.ok(
  repository.includes("export class JobPhotoUploadAttemptAbortedError") &&
    repository.includes(
      "The prior secure photo upload attempt was canceled safely. Submit again to start a new upload.",
    ),
  "A terminal aborted attempt has one recognizable error that requires a fresh operation key",
);

for (const [surface, source, inFlightRef, attemptRef] of [
  ["Photos workspace", app, "uploadInFlightRef", "uploadAttemptRef"],
  [
    "inspection upload",
    app,
    "inspectionPhotoUploadInFlightRef",
    "inspectionPhotoUploadAttemptRef",
  ],
  [
    "Field Operations",
    fieldOperations,
    "photoUploadInFlightRef",
    "photoUploadAttemptRef",
  ],
]) {
  assert.ok(
    source.includes(`${inFlightRef}.current = true`) &&
      source.includes(`${inFlightRef}.current = false`) &&
      source.includes("isJobPhotoUploadAttemptAbortedError(currentError)") &&
      source.includes(`${attemptRef}.current = null`),
    `${surface} must suppress duplicate submits, retain ordinary retries, and clear identity only after a confirmed terminal abort`,
  );
}

const photosView = sourceSection(
  app,
  "function PhotosView(",
  "type InvoicesViewProps =",
);
const inspectionsView = sourceSection(
  app,
  "function InspectionsView(",
  "type PhotosViewProps =",
);

for (const [
  surface,
  source,
  mountedRef,
  inFlightRef,
  attemptRef,
  requestRef,
] of [
  [
    "Photos workspace",
    photosView,
    "uploadMountedRef",
    "uploadInFlightRef",
    "uploadAttemptRef",
    "uploadRequestRef",
  ],
  [
    "inspection upload",
    inspectionsView,
    "inspectionPhotoUploadMountedRef",
    "inspectionPhotoUploadInFlightRef",
    "inspectionPhotoUploadAttemptRef",
    "inspectionPhotoUploadRequestRef",
  ],
  [
    "Field Operations",
    fieldOperations,
    "photoUploadMountedRef",
    "photoUploadInFlightRef",
    "photoUploadAttemptRef",
    "photoUploadRequestRef",
  ],
]) {
  const prepare = source.indexOf("await prepareJobPhotoUploadAttempt(");
  const hashingUnmountGuard = source.indexOf(
    `if (!${mountedRef}.current)`,
    prepare,
  );
  const retainAttempt = source.indexOf(
    `${attemptRef}.current = uploadAttempt`,
    hashingUnmountGuard,
  );
  const markActive = source.indexOf(
    "onJobPhotoUploadActive({ input: photoInput, attempt: uploadAttempt })",
    retainAttempt,
  );
  const ordinaryUnmountFailure = source.indexOf(
    `else if (!${mountedRef}.current)`,
    markActive,
  );
  const markInactive = source.indexOf(
    "onJobPhotoUploadInactive(",
    ordinaryUnmountFailure,
  );
  const finallyRelease = source.indexOf(
    `${inFlightRef}.current = false`,
    markInactive,
  );

  assert.ok(
    source.includes(`${mountedRef}.current = false`) &&
      source.includes(
        `if (attempt && request && !${inFlightRef}.current)`,
      ) &&
      source.includes(`${requestRef}.current`) &&
      prepare < hashingUnmountGuard &&
      hashingUnmountGuard < retainAttempt &&
      retainAttempt < markActive &&
      markActive < ordinaryUnmountFailure &&
      ordinaryUnmountFailure < markInactive &&
      markInactive < finallyRelease,
    `${surface} aborts before durable activation when hashing finishes after unmount, keeps in-flight work root-owned, and releases ordinary interrupted failures only after the live call returns`,
  );
}

for (const [surface, source, attemptRef, requestRef, unresolvedSetter] of [
  [
    "Photos workspace",
    photosView,
    "uploadAttemptRef",
    "uploadRequestRef",
    "setHasUnresolvedPhotoUploadAttempt",
  ],
  [
    "inspection upload",
    inspectionsView,
    "inspectionPhotoUploadAttemptRef",
    "inspectionPhotoUploadRequestRef",
    "setHasUnresolvedInspectionPhotoUploadAttempt",
  ],
  [
    "Field Operations",
    fieldOperations,
    "photoUploadAttemptRef",
    "photoUploadRequestRef",
    "setHasUnresolvedPhotoUploadAttempt",
  ],
]) {
  const createCall = source.indexOf("await createJobPhoto(");
  const successClear = source.indexOf(`${attemptRef}.current = null`, createCall);
  const typedAbort = source.indexOf(
    "if (isJobPhotoUploadAttemptAbortedError(currentError))",
    successClear,
  );
  const abortClear = source.indexOf(`${attemptRef}.current = null`, typedAbort);

  assert.ok(
    source.includes(`${attemptRef}.current = uploadAttempt`) &&
      source.includes(`${requestRef}.current = retainedRequest ??`) &&
      source.indexOf(`${unresolvedSetter}(true)`) < createCall &&
      createCall < successClear &&
      successClear < typedAbort &&
      typedAbort < abortClear,
    `${surface} must retain one frozen request/attempt through ordinary cleanup failures and clear it only after createJobPhoto returns committed or throws confirmed-aborted`,
  );
  assert.equal(
    (source.match(new RegExp(`${attemptRef}\\.current = null`, "g")) ?? [])
      .length,
    2,
    `${surface} must have no on-change or ordinary-error identity abandonment path`,
  );
  assert.equal(
    (source.match(new RegExp(`${unresolvedSetter}\\(false\\)`, "g")) ?? [])
      .length,
    2,
    `${surface} must release its reactive identity lock only after committed success or confirmed abort`,
  );
}

assert.ok(
  (photosView.match(
    /disabled=\{isUploading \|\| hasUnresolvedPhotoUploadAttempt\}/g,
  ) ?? []).length >= 9 &&
    photosView.includes('data-testid="job-photo-upload-lock"') &&
    photosView.includes(
      "isUploading || (!file && !hasUnresolvedPhotoUploadAttempt)",
    ),
  "Photos keeps file, company, linked-record, label, caption, and date controls disabled after a non-busy cleanup failure while leaving only unchanged retry available",
);
assert.ok(
  (inspectionsView.match(
    /disabled=\{savingAction !== null \|\| hasUnresolvedInspectionPhotoUploadAttempt\}/g,
  ) ?? []).length >= 6 &&
    inspectionsView.includes(
      "hasUnresolvedInspectionPhotoUploadAttempt && !isSelected",
    ) &&
    inspectionsView.includes('data-testid="inspection-photo-upload-lock"'),
  "Inspections keeps target, file, label, caption, category, finding, and visibility identity frozen after a non-busy cleanup failure",
);
assert.ok(
  fieldOperations.includes("disabled={hasUnresolvedPhotoUploadAttempt}") &&
    fieldOperations.includes(
      "hasUnresolvedPhotoUploadAttempt &&\n                  assignment.id !== selectedAssignmentId",
    ) &&
    (fieldOperations.match(
      /busyAction !== null \|\| hasUnresolvedPhotoUploadAttempt/g,
    ) ?? []).length >= 3 &&
    fieldOperations.includes('data-testid="field-photo-upload-lock"'),
  "Field Operations keeps company, assignment, file, category, and caption identity frozen after a non-busy cleanup failure",
);

console.log("Secure job-photo upload readiness/retry contract: PASS");
