"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  Phone,
  RefreshCcw,
  Upload,
  Users,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  addJobMaterial,
  addJobNote,
  createDailyLog,
  createJobPhoto,
  isJobPhotoUploadAttemptAbortedError,
  prepareJobPhotoUploadAttempt,
  createJobTask,
  type ActiveJobPhotoUpload,
  type JobPhotoUploadAttempt,
  updateInspection,
  updateJob,
  updateJobTask,
} from "../lib/crm/repository";
import {
  buildFieldIssueNote,
  buildFieldMaterialIssueNote,
  buildFieldOperationsSnapshot,
  buildFieldStatusNote,
  fieldStatusRequiresReason,
  getFieldStatusLabel,
  type FieldAssignment,
  type FieldAssignmentPriority,
  type FieldIssueCategory,
  type FieldStatusAction,
  type FieldUploadState,
} from "../lib/crm/fieldOperations";
import type {
  CrmSnapshot,
  DailyLogRecord,
  Database,
  JobMaterialRecord,
  JobNoteRecord,
  JobPhotoInput,
  JobPhotoRecord,
  JobStatus,
  JobTaskRecord,
} from "../lib/crm/types";

type CrmClient = SupabaseClient<Database>;

type FieldOperationsTargetView =
  | "operations"
  | "customers"
  | "documents"
  | "inspections"
  | "jobs"
  | "photos"
  | "orders"
  | "calendar";

type FieldOperationsWorkspaceProps = {
  client: CrmClient | null;
  isDemoMode: boolean;
  snapshot: CrmSnapshot;
  activeCompanyId: string;
  onReload: () => Promise<void>;
  onDemoSnapshotChange: (updater: (snapshot: CrmSnapshot) => CrmSnapshot) => void;
  onViewChange: (view: FieldOperationsTargetView) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onJobPhotoUploadActive: (upload: ActiveJobPhotoUpload) => void;
  onJobPhotoUploadInactive: (
    companyId: string,
    operationKey: string,
  ) => void;
  onJobPhotoUploadSettled: (
    companyId: string,
    operationKey: string,
  ) => void;
};

type ChecklistAction =
  | "complete"
  | "not_applicable"
  | "blocked"
  | "note"
  | "photo_required"
  | "signature_required";

const statusOptions: { value: FieldStatusAction; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "en_route", label: "En Route" },
  { value: "arrived", label: "Arrived" },
  { value: "work_started", label: "Work Started" },
  { value: "paused", label: "Paused" },
  { value: "work_completed", label: "Work Completed" },
  { value: "unable_to_complete", label: "Unable to Complete" },
];

const issueCategories: FieldIssueCategory[] = [
  "Safety",
  "Customer concern",
  "Scope discrepancy",
  "Hidden damage",
  "Material issue",
  "Access issue",
  "Weather",
  "Scheduling",
  "Quality concern",
  "Additional work",
  "Other",
];

const priorities: FieldAssignmentPriority[] = ["critical", "high", "medium", "low"];

const photoCategories = [
  "Before photos",
  "During-work photos",
  "After photos",
  "Damage photos",
  "Material photos",
  "Issue photos",
  "Completion photos",
];

const materialActions = [
  "Materials used",
  "Materials missing",
  "Damaged materials",
  "Additional materials needed",
  "Return materials",
  "Delivery issue",
];
const maxFieldPhotoBytes = 25 * 1024 * 1024;

export function FieldOperationsWorkspace({
  client,
  isDemoMode,
  snapshot,
  activeCompanyId,
  onReload,
  onDemoSnapshotChange,
  onViewChange,
  onNotice,
  onError,
  onJobPhotoUploadActive,
  onJobPhotoUploadInactive,
  onJobPhotoUploadSettled,
}: FieldOperationsWorkspaceProps) {
  const fieldData = useMemo(() => buildFieldOperationsSnapshot(snapshot), [snapshot]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(
    fieldData.currentActiveAssignment?.id ?? fieldData.assignments[0]?.id ?? "",
  );
  const [companyFilter, setCompanyFilter] = useState(activeCompanyId || "all");
  const [statusAction, setStatusAction] = useState<FieldStatusAction>("scheduled");
  const [statusReason, setStatusReason] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteNeedsOffice, setNoteNeedsOffice] = useState(false);
  const [checklistNote, setChecklistNote] = useState("");
  const [issueCategory, setIssueCategory] = useState<FieldIssueCategory>("Safety");
  const [issuePriority, setIssuePriority] = useState<FieldAssignmentPriority>("high");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueOfficeAction, setIssueOfficeAction] = useState("");
  const [materialAction, setMaterialAction] = useState("Materials used");
  const [materialName, setMaterialName] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("1");
  const [materialUnit, setMaterialUnit] = useState("each");
  const [materialDetails, setMaterialDetails] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoCategory, setPhotoCategory] = useState(photoCategories[0]);
  const photoUploadInFlightRef = useRef(false);
  const photoUploadMountedRef = useRef(true);
  const photoUploadAttemptRef = useRef<JobPhotoUploadAttempt | null>(null);
  const photoUploadRequestRef = useRef<{
    input: JobPhotoInput;
    file: File;
    assignment: FieldAssignment;
    caption: string;
    category: string;
  } | null>(null);
  const [hasUnresolvedPhotoUploadAttempt, setHasUnresolvedPhotoUploadAttempt] =
    useState(false);

  useEffect(() => {
    photoUploadMountedRef.current = true;

    return () => {
      photoUploadMountedRef.current = false;
      const attempt = photoUploadAttemptRef.current;
      const request = photoUploadRequestRef.current;

      if (attempt && request && !photoUploadInFlightRef.current) {
        onJobPhotoUploadInactive(
          request.input.company_id,
          attempt.operationKey,
        );
      }
    };
  }, [onJobPhotoUploadInactive]);
  const [uploadState, setUploadState] = useState<FieldUploadState>("ready");
  const [lastUploadError, setLastUploadError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<(() => Promise<void>) | null>(null);
  const visibleAssignments = useMemo(
    () =>
      fieldData.assignments.filter(
        (assignment) =>
          companyFilter === "all" || assignment.companyId === companyFilter,
      ),
    [companyFilter, fieldData.assignments],
  );
  const visibleFieldData = useMemo(() => {
    const visibleAssignmentIds = new Set(
      visibleAssignments.map((assignment) => assignment.id),
    );
    const nowIso = new Date().toISOString();
    const todayAssignedJobs = visibleAssignments.filter(
      (assignment) => assignment.kind === "job",
    );
    const todayInspections = visibleAssignments.filter(
      (assignment) => assignment.kind === "inspection",
    );
    const currentActiveAssignment =
      visibleAssignments.find((assignment) =>
        ["arrived", "work_started", "paused", "unable_to_complete"].includes(
          assignment.currentStatus,
        ),
      ) ??
      todayAssignedJobs.find((assignment) => assignment.currentStatus !== "work_completed") ??
      todayInspections.find((assignment) => assignment.currentStatus !== "work_completed") ??
      null;
    const nextAssignment =
      visibleAssignments.find(
        (assignment) =>
          assignment.currentStatus === "scheduled" &&
          assignment.scheduledStart !== null &&
          assignment.scheduledStart >= nowIso,
      ) ??
      todayAssignedJobs.find((assignment) => assignment.id !== currentActiveAssignment?.id) ??
      todayInspections.find((assignment) => assignment.id !== currentActiveAssignment?.id) ??
      null;
    const requiredDocuments = fieldData.requiredDocuments.filter((assignment) =>
      visibleAssignmentIds.has(assignment.id),
    );
    const incompleteChecklists = fieldData.incompleteChecklists.filter((assignment) =>
      visibleAssignmentIds.has(assignment.id),
    );
    const openIssues = fieldData.openIssues.filter((assignment) =>
      visibleAssignmentIds.has(assignment.id),
    );
    const completedToday = fieldData.completedToday.filter((assignment) =>
      visibleAssignmentIds.has(assignment.id),
    );

    return {
      currentActiveAssignment,
      nextAssignment,
      requiredDocuments,
      incompleteChecklists,
      openIssues,
      completedToday,
      summary: {
        todayAssignedJobs: todayAssignedJobs.length,
        todayInspections: todayInspections.length,
        activeAssignments: visibleAssignments.filter((assignment) =>
          ["en_route", "arrived", "work_started", "paused"].includes(
            assignment.currentStatus,
          ),
        ).length,
        requiredDocuments: requiredDocuments.length,
        incompleteChecklists: incompleteChecklists.length,
        openIssues: openIssues.length,
        completedToday: completedToday.length,
      },
    };
  }, [
    fieldData.completedToday,
    fieldData.incompleteChecklists,
    fieldData.openIssues,
    fieldData.requiredDocuments,
    visibleAssignments,
  ]);
  const selectedAssignment =
    visibleAssignments.find((assignment) => assignment.id === selectedAssignmentId) ??
    visibleAssignments[0] ??
    null;
  const selectedAssignmentCurrentStatus = selectedAssignment?.currentStatus;
  const selectedAssignmentStableId = selectedAssignment?.id;
  const hasUnsentFormState = Boolean(
    statusReason.trim() ||
      noteText.trim() ||
      checklistNote.trim() ||
      issueDescription.trim() ||
      issueOfficeAction.trim() ||
      materialName.trim() ||
      materialDetails.trim() ||
      photoFile ||
      photoCaption.trim(),
  );

  useEffect(() => {
    if (hasUnresolvedPhotoUploadAttempt) {
      return;
    }

    if (!visibleAssignments.some((assignment) => assignment.id === selectedAssignmentId)) {
      setSelectedAssignmentId(visibleAssignments[0]?.id ?? "");
    }
  }, [hasUnresolvedPhotoUploadAttempt, selectedAssignmentId, visibleAssignments]);

  useEffect(() => {
    if (selectedAssignmentCurrentStatus) {
      setStatusAction(selectedAssignmentCurrentStatus);
    }
  }, [selectedAssignmentCurrentStatus, selectedAssignmentStableId]);

  useEffect(() => {
    if (!hasUnsentFormState) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsentFormState]);

  const runFieldAction = async (
    actionId: string,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    if (!selectedAssignment || busyAction !== null) {
      return;
    }

    try {
      setBusyAction(actionId);
      setLastFailedAction(null);
      await action();
      await onReload();
      onNotice(successMessage);
    } catch (currentError) {
      const message =
        currentError instanceof Error
          ? currentError.message
          : "Unable to save field update.";
      setLastFailedAction(() => action);
      onError(message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleStatusSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAssignment) {
      return;
    }

    if (fieldStatusRequiresReason(statusAction) && !statusReason.trim()) {
      onError(`Add a reason before marking ${getFieldStatusLabel(statusAction)}.`);
      return;
    }

    await runFieldAction(
      "status",
      async () => {
        const note = buildFieldStatusNote({
          assignment: selectedAssignment,
          status: statusAction,
          reason: statusReason,
        });

        if (selectedAssignment.kind === "job") {
          await saveJobStatus(selectedAssignment, statusAction, note);
        } else {
          await saveInspectionStatus(selectedAssignment, statusAction, note);
        }

        setStatusReason("");
      },
      `Field status saved as ${getFieldStatusLabel(statusAction)}.`,
    );
  };

  const handleAddNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAssignment || !noteText.trim()) {
      onError("Add a field note before saving.");
      return;
    }

    await runFieldAction(
      "note",
      async () => {
        const prefix = noteNeedsOffice
          ? "Office attention required - "
          : "Field note - ";
        const note = `${prefix}${noteText.trim()}`;

        if (selectedAssignment.kind === "job") {
          await saveJobNote(selectedAssignment.sourceRecordId, note);
        } else {
          await appendInspectionInternalNote(selectedAssignment.sourceRecordId, note);
        }

        setNoteText("");
        setNoteNeedsOffice(false);
      },
      noteNeedsOffice ? "Field note sent to office attention." : "Field note saved.",
    );
  };

  const handleChecklistAction = async (
    assignment: FieldAssignment,
    taskId: string | null,
    title: string,
    action: ChecklistAction,
  ) => {
    if (assignment.kind !== "job") {
      await runFieldAction(
        `inspection-checklist:${action}`,
        async () => {
          await appendInspectionInternalNote(
            assignment.sourceRecordId,
            `Field checklist - ${actionLabel(action)}: ${title}${
              checklistNote.trim() ? `\nNote: ${checklistNote.trim()}` : ""
            }`,
          );
          setChecklistNote("");
        },
        "Inspection checklist note saved.",
      );
      return;
    }

    await runFieldAction(
      `checklist:${action}:${taskId ?? title}`,
      async () => {
        if (taskId) {
          await updateChecklistTask(taskId, action, checklistNote, title);
        } else {
          await createChecklistTask(assignment.sourceRecordId, title, action, checklistNote);
        }
        setChecklistNote("");
      },
      `Checklist item marked ${actionLabel(action)}.`,
    );
  };

  const handleIssueSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAssignment || !issueDescription.trim()) {
      onError("Describe the field issue before submitting.");
      return;
    }

    await runFieldAction(
      "issue",
      async () => {
        const note = buildFieldIssueNote({
          assignment: selectedAssignment,
          category: issueCategory,
          priority: issuePriority,
          description: issueDescription,
          requestedOfficeAction: issueOfficeAction,
        });

        if (selectedAssignment.kind === "job") {
          await saveJobNote(selectedAssignment.sourceRecordId, note);
        } else {
          await appendInspectionInternalNote(selectedAssignment.sourceRecordId, note);
        }

        setIssueDescription("");
        setIssueOfficeAction("");
      },
      "Field issue submitted to the Operations Queue.",
    );
  };

  const handleMaterialSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAssignment || selectedAssignment.kind !== "job") {
      onError("Select a job assignment before recording materials.");
      return;
    }

    if (!materialName.trim()) {
      onError("Add a material name before saving.");
      return;
    }

    await runFieldAction(
      "material",
      async () => {
        const quantity = Number(materialQuantity) || 1;
        await saveJobMaterial(selectedAssignment.sourceRecordId, {
          name: materialName,
          quantity,
          unit: materialUnit || "each",
          notes: `${materialAction}${materialDetails.trim() ? ` - ${materialDetails.trim()}` : ""}`,
        });

        if (materialAction !== "Materials used") {
          await saveJobNote(
            selectedAssignment.sourceRecordId,
            buildFieldMaterialIssueNote({
              assignment: selectedAssignment,
              materialAction,
              materialName,
              quantity,
              unit: materialUnit || "each",
              details: materialDetails,
            }),
          );
        }

        setMaterialName("");
        setMaterialQuantity("1");
        setMaterialUnit("each");
        setMaterialDetails("");
      },
      materialAction === "Materials used"
        ? "Material usage saved."
        : "Material issue saved for office review.",
    );
  };

  const handlePhotoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await uploadSelectedPhoto();
  };

  const uploadSelectedPhoto = async () => {
    if (busyAction !== null || photoUploadInFlightRef.current) {
      return;
    }

    const retainedRequest = photoUploadRequestRef.current;
    const uploadAssignment = retainedRequest?.assignment ?? selectedAssignment;
    const uploadFile = retainedRequest?.file ?? photoFile;

    if (!uploadAssignment || !uploadFile) {
      onError("Choose a photo before uploading.");
      return;
    }

    if (!uploadFile.type.startsWith("image/")) {
      setUploadState("failed");
      setLastUploadError("Choose an image file from the camera or photo library.");
      onError("Choose an image file from the camera or photo library.");
      return;
    }

    if (uploadFile.size > maxFieldPhotoBytes) {
      setUploadState("failed");
      setLastUploadError("Field photos must be 25 MB or smaller.");
      onError("Field photos must be 25 MB or smaller.");
      return;
    }

    const photoInput: JobPhotoInput = retainedRequest?.input ?? {
      company_id: uploadAssignment.companyId,
      customer_id: uploadAssignment.customerId,
      property_id: uploadAssignment.propertyId,
      job_id:
        uploadAssignment.kind === "job"
          ? uploadAssignment.sourceRecordId
          : null,
      inspection_id:
        uploadAssignment.kind === "inspection"
          ? uploadAssignment.sourceRecordId
          : null,
      label: photoCategory,
      caption: photoCaption.trim() || photoCategory,
      taken_at:
        photoUploadAttemptRef.current?.takenAt ??
        new Date().toISOString().slice(0, 10),
      is_customer_visible: false,
    };

    photoUploadInFlightRef.current = true;

    try {
      setBusyAction("photo");
      setLastFailedAction(null);
      setUploadState("uploading");
      setLastUploadError("");
      const uploadAttempt =
        photoUploadAttemptRef.current ??
        (await prepareJobPhotoUploadAttempt(photoInput, uploadFile));

      if (!photoUploadMountedRef.current) {
        return;
      }

      photoUploadAttemptRef.current = uploadAttempt;
      photoUploadRequestRef.current = retainedRequest ?? {
        input: photoInput,
        file: uploadFile,
        assignment: uploadAssignment,
        caption: photoCaption,
        category: photoCategory,
      };
      setHasUnresolvedPhotoUploadAttempt(true);
      onJobPhotoUploadActive({ input: photoInput, attempt: uploadAttempt });

      if (isDemoMode) {
        saveDemoPhoto(
          uploadAssignment,
          retainedRequest?.caption ?? photoCaption,
          retainedRequest?.category ?? photoCategory,
          uploadAttempt,
        );
      } else if (client) {
        await createJobPhoto(client, photoInput, uploadFile, uploadAttempt);
      } else {
        throw new Error("Live CRM client is unavailable.");
      }

      await onReload();
      onJobPhotoUploadSettled(photoInput.company_id, uploadAttempt.operationKey);
      photoUploadAttemptRef.current = null;
      photoUploadRequestRef.current = null;
      setHasUnresolvedPhotoUploadAttempt(false);
      setUploadState("uploaded");
      setPhotoFile(null);
      setPhotoCaption("");
      onNotice("Field photo uploaded securely.");
    } catch (currentError) {
      if (isJobPhotoUploadAttemptAbortedError(currentError)) {
        const abortedAttempt = photoUploadAttemptRef.current;
        const abortedRequest = photoUploadRequestRef.current;

        if (abortedAttempt && abortedRequest) {
          onJobPhotoUploadSettled(
            abortedRequest.input.company_id,
            abortedAttempt.operationKey,
          );
        }
        photoUploadAttemptRef.current = null;
        photoUploadRequestRef.current = null;
        setHasUnresolvedPhotoUploadAttempt(false);
      } else if (!photoUploadMountedRef.current) {
        const interruptedAttempt = photoUploadAttemptRef.current;
        const interruptedRequest = photoUploadRequestRef.current;

        if (interruptedAttempt && interruptedRequest) {
          onJobPhotoUploadInactive(
            interruptedRequest.input.company_id,
            interruptedAttempt.operationKey,
          );
        }
      }
      const message =
        currentError instanceof Error
          ? currentError.message
          : "Unable to upload field photo.";
      setUploadState("failed");
      setLastUploadError(message);
      onError(message);
    } finally {
      photoUploadInFlightRef.current = false;
      setBusyAction(null);
    }
  };

  const saveJobStatus = async (
    assignment: FieldAssignment,
    status: FieldStatusAction,
    note: string,
  ) => {
    const nextStatus = mapFieldStatusToJobStatus(status);

    if (isDemoMode) {
      const now = new Date().toISOString();
      onDemoSnapshotChange((currentSnapshot) => ({
        ...currentSnapshot,
        jobs: currentSnapshot.jobs.map((job) =>
          job.id === assignment.sourceRecordId
            ? { ...job, status: nextStatus, updated_at: now }
            : job,
        ),
        jobNotes: [createDemoJobNote(assignment.sourceRecordId, note), ...currentSnapshot.jobNotes],
      }));
      if (status === "work_started" || status === "work_completed") {
        await saveDailyLog(assignment, getFieldStatusLabel(status));
      }
      return;
    }

    if (!client) {
      throw new Error("Live CRM client is unavailable.");
    }

    await updateJob(client, assignment.sourceRecordId, { status: nextStatus });
    await addJobNote(client, { job_id: assignment.sourceRecordId, note });
    if (status === "work_started" || status === "work_completed") {
      await saveDailyLog(assignment, getFieldStatusLabel(status));
    }
  };

  const saveInspectionStatus = async (
    assignment: FieldAssignment,
    status: FieldStatusAction,
    note: string,
  ) => {
    const inspection = snapshot.inspections.find(
      (item) => item.id === assignment.sourceRecordId,
    );
    const nextStatus = status === "work_completed" ? "completed" : "in_progress";
    const nextInternalNotes = [inspection?.internal_notes, note]
      .filter(Boolean)
      .join("\n\n");

    if (isDemoMode) {
      const now = new Date().toISOString();
      onDemoSnapshotChange((currentSnapshot) => ({
        ...currentSnapshot,
        inspections: currentSnapshot.inspections.map((item) =>
          item.id === assignment.sourceRecordId
            ? {
                ...item,
                status: nextStatus,
                completed_at: status === "work_completed" ? now : item.completed_at,
                internal_notes: nextInternalNotes,
                updated_at: now,
              }
            : item,
        ),
      }));
      return;
    }

    if (!client) {
      throw new Error("Live CRM client is unavailable.");
    }

    await updateInspection(client, assignment.sourceRecordId, {
      status: nextStatus,
      completed_at: status === "work_completed" ? new Date().toISOString() : inspection?.completed_at,
      internal_notes: nextInternalNotes,
    });
  };

  const saveJobNote = async (jobId: string, note: string) => {
    if (isDemoMode) {
      onDemoSnapshotChange((currentSnapshot) => ({
        ...currentSnapshot,
        jobNotes: [createDemoJobNote(jobId, note), ...currentSnapshot.jobNotes],
      }));
      return;
    }

    if (!client) {
      throw new Error("Live CRM client is unavailable.");
    }

    await addJobNote(client, { job_id: jobId, note });
  };

  const appendInspectionInternalNote = async (inspectionId: string, note: string) => {
    const inspection = snapshot.inspections.find((item) => item.id === inspectionId);
    const nextInternalNotes = [inspection?.internal_notes, note]
      .filter(Boolean)
      .join("\n\n");

    if (isDemoMode) {
      const now = new Date().toISOString();
      onDemoSnapshotChange((currentSnapshot) => ({
        ...currentSnapshot,
        inspections: currentSnapshot.inspections.map((item) =>
          item.id === inspectionId
            ? { ...item, internal_notes: nextInternalNotes, updated_at: now }
            : item,
        ),
      }));
      return;
    }

    if (!client) {
      throw new Error("Live CRM client is unavailable.");
    }

    await updateInspection(client, inspectionId, { internal_notes: nextInternalNotes });
  };

  const updateChecklistTask = async (
    taskId: string,
    action: ChecklistAction,
    note: string,
    title: string,
  ) => {
    const task = snapshot.jobTasks.find((item) => item.id === taskId);
    const nextStatus = mapChecklistActionToStatus(action);
    const nextDescription = [
      task?.description,
      `Field checklist - ${actionLabel(action)}${note.trim() ? `: ${note.trim()}` : ""}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (isDemoMode) {
      const now = new Date().toISOString();
      onDemoSnapshotChange((currentSnapshot) => ({
        ...currentSnapshot,
        jobTasks: currentSnapshot.jobTasks.map((item) =>
          item.id === taskId
            ? {
                ...item,
                status: nextStatus,
                description: nextDescription,
                updated_at: now,
              }
            : item,
        ),
      }));
      return;
    }

    if (!client) {
      throw new Error("Live CRM client is unavailable.");
    }

    await updateJobTask(client, taskId, {
      title,
      status: nextStatus,
      description: nextDescription,
    });
  };

  const createChecklistTask = async (
    jobId: string,
    title: string,
    action: ChecklistAction,
    note: string,
  ) => {
    const status = mapChecklistActionToStatus(action);
    const description = `Field checklist - ${actionLabel(action)}${
      note.trim() ? `: ${note.trim()}` : ""
    }`;

    if (isDemoMode) {
      const now = new Date().toISOString();
      onDemoSnapshotChange((currentSnapshot) => ({
        ...currentSnapshot,
        jobTasks: [
          ...currentSnapshot.jobTasks,
          {
            id: `demo-field-task-${Date.now()}`,
            job_id: jobId,
            title,
            description,
            status,
            sort_order: currentSnapshot.jobTasks.filter((task) => task.job_id === jobId).length,
            created_at: now,
            updated_at: now,
          },
        ],
      }));
      return;
    }

    if (!client) {
      throw new Error("Live CRM client is unavailable.");
    }

    await createJobTask(client, {
      job_id: jobId,
      title,
      description,
      status,
    });
  };

  const saveJobMaterial = async (
    jobId: string,
    input: Pick<JobMaterialRecord, "name" | "quantity" | "unit" | "notes">,
  ) => {
    if (isDemoMode) {
      const now = new Date().toISOString();
      onDemoSnapshotChange((currentSnapshot) => ({
        ...currentSnapshot,
        jobMaterials: [
          {
            id: `demo-field-material-${Date.now()}`,
            job_id: jobId,
            created_at: now,
            ...input,
          },
          ...currentSnapshot.jobMaterials,
        ],
      }));
      return;
    }

    if (!client) {
      throw new Error("Live CRM client is unavailable.");
    }

    await addJobMaterial(client, { job_id: jobId, ...input });
  };

  const saveDailyLog = async (assignment: FieldAssignment, workCompleted: string) => {
    if (assignment.kind !== "job") {
      return;
    }

    if (isDemoMode) {
      const now = new Date().toISOString();
      const dailyLog: DailyLogRecord = {
        id: `demo-field-log-${Date.now()}`,
        company_id: assignment.companyId,
        employee_id: null,
        job_id: assignment.sourceRecordId,
        log_date: now.slice(0, 10),
        weather_summary: null,
        work_completed: workCompleted,
        blockers: null,
        tomorrow_plan: null,
        created_at: now,
        updated_at: now,
      };

      onDemoSnapshotChange((currentSnapshot) => ({
        ...currentSnapshot,
        dailyLogs: [dailyLog, ...currentSnapshot.dailyLogs],
      }));
      return;
    }

    if (!client) {
      throw new Error("Live CRM client is unavailable.");
    }

    await createDailyLog(client, {
      company_id: assignment.companyId,
      employee_id: null,
      job_id: assignment.sourceRecordId,
      log_date: new Date().toISOString().slice(0, 10),
      work_completed: workCompleted,
    });
  };

  const saveDemoPhoto = (
    assignment: FieldAssignment,
    caption: string,
    category: string,
    uploadAttempt: JobPhotoUploadAttempt,
  ) => {
    const now = new Date().toISOString();
    const photo: JobPhotoRecord = {
      id: uploadAttempt.operationKey,
      company_id: assignment.companyId,
      customer_id: assignment.customerId,
      property_id: assignment.propertyId,
      job_id: assignment.kind === "job" ? assignment.sourceRecordId : null,
      estimate_id: null,
      inspection_id: assignment.kind === "inspection" ? assignment.sourceRecordId : null,
      label: category,
      caption: caption.trim() || category,
      taken_at: uploadAttempt.takenAt,
      file_path: uploadAttempt.filePath,
      file_url: null,
      signed_url: null,
      upload_operation_key: uploadAttempt.operationKey,
      upload_request_fingerprint: uploadAttempt.requestFingerprint,
      is_customer_visible: false,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    };

    onDemoSnapshotChange((currentSnapshot) => ({
      ...currentSnapshot,
      jobPhotos: currentSnapshot.jobPhotos.some(
        (currentPhoto) =>
          currentPhoto.company_id === photo.company_id &&
          currentPhoto.upload_operation_key === photo.upload_operation_key,
      )
        ? currentSnapshot.jobPhotos
        : [photo, ...currentSnapshot.jobPhotos],
    }));
  };

  const handleRetry = async () => {
    if (lastFailedAction) {
      await runFieldAction("retry", lastFailedAction, "Field update retried successfully.");
    } else if (uploadState === "failed" && photoFile) {
      await uploadSelectedPhoto();
    }
  };

  const callCustomer = () => {
    if (!selectedAssignment?.customerPhone) {
      onError("No customer phone number is available for this assignment.");
      return;
    }

    window.location.href = `tel:${selectedAssignment.customerPhone}`;
  };

  const openMap = () => {
    if (!selectedAssignment) {
      return;
    }

    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        selectedAssignment.propertyAddress,
      )}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div
      className="grid min-w-0 max-w-full gap-4 overflow-x-hidden"
      data-testid="field-operations-workspace"
    >
      <section className="min-w-0 rounded-2xl border border-wt-border bg-wt-surface p-4 shadow-[var(--wt-shadow)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
              Field Operations
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-wt-ink">
              Mobile crew workspace
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-wt-muted">
              Today&apos;s jobs, inspections, access notes, documents,
              checklists, materials, photos, and field issues in one
              phone-friendly workspace.
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:min-w-[420px]">
            <FieldMetric label="Jobs today" value={visibleFieldData.summary.todayAssignedJobs} tone="blue" />
            <FieldMetric label="Inspections" value={visibleFieldData.summary.todayInspections} tone="blue" />
            <FieldMetric label="Open issues" value={visibleFieldData.summary.openIssues} tone={visibleFieldData.summary.openIssues ? "amber" : "green"} />
            <FieldMetric label="Completed" value={visibleFieldData.summary.completedToday} tone="green" />
          </div>
        </div>

        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <FieldFocusCard title="Current active assignment" assignment={visibleFieldData.currentActiveAssignment} />
            <FieldFocusCard title="Next assignment" assignment={visibleFieldData.nextAssignment} />
            <FieldFocusCard title="Required documents" assignment={visibleFieldData.requiredDocuments[0] ?? null} />
            <FieldFocusCard title="Office attention" assignment={visibleFieldData.openIssues[0] ?? null} />
          </div>
          <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-wt-muted">
            Company context
            <select
              data-testid="field-company-filter"
              value={companyFilter}
              disabled={hasUnresolvedPhotoUploadAttempt}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="min-h-11 rounded-xl border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold normal-case text-wt-ink focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">All permitted companies</option>
              {snapshot.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {hasUnsentFormState ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          You have unsent field updates in this session. Save or clear them before
          leaving the workspace.
        </div>
      ) : null}

      {lastFailedAction || uploadState === "failed" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold">
            A field update failed. {lastUploadError || "Nothing was marked complete."}
          </p>
          <button
            type="button"
            onClick={() => void handleRetry()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-3 py-2 font-bold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            <RefreshCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid min-w-0 max-w-full gap-4 overflow-hidden xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.15fr)]">
        <section className="min-w-0 rounded-2xl border border-wt-border bg-wt-surface p-3 shadow-[var(--wt-shadow)]">
          <div className="flex items-center justify-between gap-3 px-1 pb-3">
            <div>
              <h3 className="text-lg font-black text-wt-ink">Today&apos;s assigned work</h3>
              <p className="text-sm text-wt-muted">
                Tap an assignment to work from the field detail.
              </p>
            </div>
            <span className="rounded-lg bg-wt-surface-muted px-3 py-1 text-sm font-bold text-wt-ink">
              {visibleAssignments.length}
            </span>
          </div>
          <div className="grid gap-2" data-testid="field-assignment-list">
            {visibleAssignments.map((assignment) => (
              <button
                key={assignment.id}
                type="button"
                data-testid="field-assignment-card"
                data-company-id={assignment.companyId}
                data-assignment-kind={assignment.kind}
                aria-pressed={selectedAssignment?.id === assignment.id}
                disabled={
                  hasUnresolvedPhotoUploadAttempt &&
                  assignment.id !== selectedAssignmentId
                }
                onClick={() => setSelectedAssignmentId(assignment.id)}
                className={`grid min-h-24 w-full min-w-0 gap-2 rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                  selectedAssignment?.id === assignment.id
                    ? "border-orange-300 bg-orange-50 shadow-sm"
                    : "border-wt-border bg-wt-surface-muted hover:border-orange-200 hover:bg-amber-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-black text-wt-ink">
                      {assignment.title}
                    </p>
                    <p className="mt-1 break-words text-sm text-wt-muted">
                      {assignment.customerName} · {formatTimeRange(assignment)}
                    </p>
                  </div>
                  <FieldPill label={assignment.workflowStage} tone={statusTone(assignment.currentStatus)} />
                </div>
                <div className="grid gap-1 text-xs font-semibold text-wt-muted">
                  <span className="flex min-w-0 items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {assignment.propertyAddress}
                  </span>
                  <span className="flex min-w-0 items-center gap-1">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    {assignment.assignedCrew} · {assignment.assignedEmployee}
                  </span>
                </div>
              </button>
            ))}
            {!visibleAssignments.length ? (
              <FieldEmptyState
                title="No field assignments for this scope."
                detail="Scheduled jobs and inspections will appear here when they are assigned for today."
              />
            ) : null}
          </div>
        </section>

        <section
          className="min-w-0 overflow-hidden rounded-2xl border border-wt-border bg-wt-surface shadow-[var(--wt-shadow)]"
          data-testid="field-assignment-detail"
        >
          {selectedAssignment ? (
            <div className="grid gap-4 p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FieldPill label={selectedAssignment.companyName} tone="blue" />
                    <FieldPill label={selectedAssignment.assignmentType} tone="slate" />
                    <FieldPill label={getFieldStatusLabel(selectedAssignment.currentStatus)} tone={statusTone(selectedAssignment.currentStatus)} />
                  </div>
                  <h3 className="mt-3 break-words text-2xl font-black tracking-tight text-wt-ink">
                    {selectedAssignment.title}
                  </h3>
                  <p className="mt-1 break-words text-sm font-semibold text-wt-muted">
                    {selectedAssignment.customerName} · {selectedAssignment.propertyLabel}
                  </p>
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                  <FieldQuickButton label="Call" icon={Phone} onClick={callCustomer} />
                  <FieldQuickButton label="Map" icon={Navigation} onClick={openMap} />
                  <FieldQuickButton label="Documents" icon={FileText} onClick={() => onViewChange("documents")} />
                  <FieldQuickButton label="Photos" icon={Camera} onClick={() => onViewChange("photos")} />
                </div>
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <FieldInfoCard label="Schedule" value={formatTimeRange(selectedAssignment)} icon={ClipboardCheck} />
                <FieldInfoCard label="Property" value={selectedAssignment.propertyAddress} icon={MapPin} />
                <FieldInfoCard label="Crew / owner" value={`${selectedAssignment.assignedCrew} · ${selectedAssignment.assignedEmployee}`} icon={Users} />
                <FieldInfoCard label="Next action" value={selectedAssignment.suggestedNextAction} icon={ChevronRight} />
              </div>

              <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                <FieldDetailBlock title="Access and property context" testId="field-property-summary">
                  <FieldLine label="Gate code" value={selectedAssignment.gateCode ?? "No gate code recorded"} />
                  <FieldLine label="Access" value={selectedAssignment.accessInstructions} />
                  <FieldLine label="Property notes" value={selectedAssignment.propertyNotes} />
                  <FieldLine label="Roof / paint system" value={selectedAssignment.systemSummary} />
                  <FieldLine label="Inspection status" value={selectedAssignment.inspectionSummary} />
                </FieldDetailBlock>
                <FieldDetailBlock title="Readiness" testId="field-readiness-summary">
                  <FieldLine label="Required documents" value={`${selectedAssignment.requiredDocumentCount} missing`} />
                  <FieldLine label="Checklist" value={`${selectedAssignment.incompleteChecklistCount} incomplete`} />
                  <FieldLine label="Photos" value={`${selectedAssignment.photoCount} linked`} />
                  <FieldLine label="Office issues" value={`${selectedAssignment.openIssueCount} open`} />
                  <FieldLine label="Upload state" value={uploadStateLabel(uploadState)} />
                </FieldDetailBlock>
              </div>

              <form
                onSubmit={(event) => void handleStatusSubmit(event)}
                className="rounded-xl border border-wt-border bg-wt-surface-muted p-3"
                data-testid="field-status-form"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <label className="grid flex-1 gap-1 text-xs font-bold uppercase tracking-[0.12em] text-wt-muted">
                    Field status
                    <select
                      data-testid="field-status-select"
                      value={statusAction}
                      onChange={(event) => setStatusAction(event.target.value as FieldStatusAction)}
                      className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold normal-case text-wt-ink"
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid flex-[1.4] gap-1 text-xs font-bold uppercase tracking-[0.12em] text-wt-muted">
                    Reason
                    <input
                      data-testid="field-status-reason"
                      value={statusReason}
                      onChange={(event) => setStatusReason(event.target.value)}
                      className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold normal-case text-wt-ink"
                      placeholder={
                        fieldStatusRequiresReason(statusAction)
                          ? "Required for paused or unable to complete"
                          : "Optional field note"
                      }
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    data-testid="field-save-status"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {busyAction === "status" ? "Saving" : "Save status"}
                  </button>
                </div>
              </form>

              <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                <FieldDetailBlock title="Field checklist" testId="field-checklist-section">
                  <label className="mb-3 grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-wt-muted">
                    Checklist note
                    <input
                      value={checklistNote}
                      onChange={(event) => setChecklistNote(event.target.value)}
                      className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold normal-case text-wt-ink"
                      placeholder="Optional note for blocked, N/A, photo, or signature needs"
                    />
                  </label>
                  <div className="grid gap-2">
                    {selectedAssignment.checklist.map((item) => (
                      <div
                        key={item.id}
                        data-testid="field-checklist-row"
                        className="rounded-lg border border-wt-border bg-wt-surface p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words font-bold text-wt-ink">{item.title}</p>
                            <p className="mt-1 text-xs font-semibold text-wt-muted">
                              {item.section}
                              {item.photoRequired ? " · Photo required" : ""}
                              {item.signatureRequired ? " · Signature required" : ""}
                            </p>
                          </div>
                          <FieldPill label={item.status.replace(/_/g, " ")} tone={item.status === "done" ? "green" : item.status === "in_progress" ? "amber" : "slate"} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <MiniAction label="Complete" testId="field-checklist-complete" onClick={() => void handleChecklistAction(selectedAssignment, item.taskId, item.title, "complete")} />
                          <MiniAction label="N/A" onClick={() => void handleChecklistAction(selectedAssignment, item.taskId, item.title, "not_applicable")} />
                          <MiniAction label="Blocked" testId="field-checklist-blocked" onClick={() => void handleChecklistAction(selectedAssignment, item.taskId, item.title, "blocked")} />
                          <MiniAction label="Note" onClick={() => void handleChecklistAction(selectedAssignment, item.taskId, item.title, "note")} />
                          <MiniAction label="Photo req." onClick={() => void handleChecklistAction(selectedAssignment, item.taskId, item.title, "photo_required")} />
                          <MiniAction label="Signature req." onClick={() => void handleChecklistAction(selectedAssignment, item.taskId, item.title, "signature_required")} />
                        </div>
                      </div>
                    ))}
                  </div>
                </FieldDetailBlock>

                <FieldDetailBlock title="Documents, notes, and office handoff" testId="field-office-handoff">
                  <div className="grid gap-2">
                    {selectedAssignment.requiredDocuments.map((document) => (
                      <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-wt-border bg-wt-surface p-3">
                        <span className="text-sm font-bold text-wt-ink">{document.label}</span>
                        <FieldPill label={document.status === "ready" ? "Ready" : "Missing"} tone={document.status === "ready" ? "green" : "amber"} />
                      </div>
                    ))}
                  </div>
                  <form onSubmit={(event) => void handleAddNote(event)} className="mt-3 grid gap-2">
                    <textarea
                      data-testid="field-note-input"
                      value={noteText}
                      onChange={(event) => setNoteText(event.target.value)}
                      className="min-h-28 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm text-wt-ink"
                      placeholder="Add field or office handoff note"
                    />
                    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-wt-border bg-wt-surface px-3 text-sm font-semibold text-wt-ink">
                      <input
                        type="checkbox"
                        checked={noteNeedsOffice}
                        onChange={(event) => setNoteNeedsOffice(event.target.checked)}
                      />
                      Office attention required
                    </label>
                    <button
                      type="submit"
                      data-testid="field-add-note"
                      disabled={busyAction !== null}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-purple-700 px-4 py-2 text-sm font-bold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <MessageSquare className="h-4 w-4" />
                      {busyAction === "note" ? "Saving" : "Add note"}
                    </button>
                  </form>
                </FieldDetailBlock>
              </div>

              <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                <form
                  onSubmit={(event) => void handlePhotoSubmit(event)}
                  className="rounded-xl border border-wt-border bg-wt-surface-muted p-3"
                  data-testid="field-photo-upload-form"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-black text-wt-ink">Upload field photo</h4>
                      <p className="mt-1 text-sm text-wt-muted">
                        Camera or library upload using the existing job photo storage.
                      </p>
                    </div>
                    <FieldPill label={uploadStateLabel(uploadState)} tone={uploadState === "failed" ? "red" : uploadState === "uploaded" ? "green" : "blue"} />
                  </div>
                  <div className="mt-3 grid gap-2">
                    <label className="grid min-h-28 place-items-center rounded-xl border border-dashed border-wt-border bg-wt-surface p-4 text-center text-sm font-bold text-wt-muted">
                      <Upload className="mb-2 h-7 w-7 text-orange-600" />
                      <span className="max-w-full break-words">
                        {photoFile ? photoFile.name : "Choose photo from camera or library"}
                      </span>
                      <input
                        data-testid="field-photo-file-input"
                        type="file"
                        accept="image/*"
                        disabled={
                          busyAction !== null || hasUnresolvedPhotoUploadAttempt
                        }
                        className="sr-only"
                        onChange={(event) => {
                          setPhotoFile(event.target.files?.[0] ?? null);
                          setUploadState("ready");
                          setLastUploadError("");
                        }}
                      />
                    </label>
                    <select
                      data-testid="field-photo-category-select"
                      value={photoCategory}
                      disabled={
                        busyAction !== null || hasUnresolvedPhotoUploadAttempt
                      }
                      onChange={(event) => setPhotoCategory(event.target.value)}
                      className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold text-wt-ink"
                    >
                      {photoCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <input
                      data-testid="field-photo-caption-input"
                      value={photoCaption}
                      disabled={
                        busyAction !== null || hasUnresolvedPhotoUploadAttempt
                      }
                      onChange={(event) => setPhotoCaption(event.target.value)}
                      className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm text-wt-ink"
                      placeholder="Caption"
                    />
                    <button
                      type="submit"
                      data-testid="field-photo-submit"
                      disabled={!photoFile || busyAction !== null}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <Camera className="h-4 w-4" />
                      {busyAction === "photo" ? "Uploading" : "Upload photo"}
                    </button>
                    {hasUnresolvedPhotoUploadAttempt ? (
                      <p
                        data-testid="field-photo-upload-lock"
                        className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm font-semibold text-amber-900"
                      >
                        Retry this unchanged upload before editing its file, target,
                        category, or caption.
                      </p>
                    ) : null}
                    <p data-testid="field-photo-upload-state" className="text-sm font-semibold text-wt-muted">
                      Upload state: {uploadStateLabel(uploadState)}
                    </p>
                    {uploadState === "failed" ? (
                      <button
                        type="button"
                        data-testid="field-photo-retry"
                        onClick={() => void uploadSelectedPhoto()}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-800"
                      >
                        Retry failed upload
                      </button>
                    ) : null}
                  </div>
                </form>

                <form
                  onSubmit={(event) => void handleIssueSubmit(event)}
                  className="rounded-xl border border-wt-border bg-wt-surface-muted p-3"
                  data-testid="field-issue-form"
                >
                  <h4 className="font-black text-wt-ink">Report issue</h4>
                  <p className="mt-1 text-sm text-wt-muted">
                    High-priority issues surface in the Operations Queue automatically.
                  </p>
                  <div className="mt-3 grid gap-2">
                    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                      <select
                        data-testid="field-issue-category"
                        value={issueCategory}
                        onChange={(event) => setIssueCategory(event.target.value as FieldIssueCategory)}
                        className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold text-wt-ink"
                      >
                        {issueCategories.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                      <select
                        data-testid="field-issue-priority"
                        value={issuePriority}
                        onChange={(event) => setIssuePriority(event.target.value as FieldAssignmentPriority)}
                        className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold capitalize text-wt-ink"
                      >
                        {priorities.map((priority) => (
                          <option key={priority} value={priority}>{priority}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      data-testid="field-issue-details"
                      value={issueDescription}
                      onChange={(event) => setIssueDescription(event.target.value)}
                      className="min-h-28 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm text-wt-ink"
                      placeholder="Describe what happened"
                    />
                    <input
                      data-testid="field-issue-office-action"
                      value={issueOfficeAction}
                      onChange={(event) => setIssueOfficeAction(event.target.value)}
                      className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm text-wt-ink"
                      placeholder="Requested office action"
                    />
                    <button
                      type="submit"
                      disabled={busyAction !== null}
                      data-testid="field-issue-submit"
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {busyAction === "issue" ? "Submitting" : "Report issue"}
                    </button>
                  </div>
                </form>
              </div>

              <form
                onSubmit={(event) => void handleMaterialSubmit(event)}
                className="rounded-xl border border-wt-border bg-wt-surface-muted p-3"
                data-testid="field-material-form"
              >
                <h4 className="font-black text-wt-ink">Materials</h4>
                <p className="mt-1 text-sm text-wt-muted">
                  Missing, damaged, additional, or delivery material issues create office visibility.
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_96px_120px]">
                  <select
                    data-testid="field-material-action"
                    value={materialAction}
                    onChange={(event) => setMaterialAction(event.target.value)}
                    className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold text-wt-ink"
                  >
                    {materialActions.map((action) => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                  <input
                    data-testid="field-material-name"
                    value={materialName}
                    onChange={(event) => setMaterialName(event.target.value)}
                    className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm text-wt-ink"
                    placeholder="Material name"
                  />
                  <input
                    value={materialQuantity}
                    onChange={(event) => setMaterialQuantity(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm text-wt-ink"
                    aria-label="Material quantity"
                  />
                  <input
                    value={materialUnit}
                    onChange={(event) => setMaterialUnit(event.target.value)}
                    className="min-h-11 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm text-wt-ink"
                    placeholder="Unit"
                    aria-label="Material unit"
                  />
                </div>
                <textarea
                  value={materialDetails}
                  onChange={(event) => setMaterialDetails(event.target.value)}
                  className="mt-2 min-h-20 w-full rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm text-wt-ink"
                  placeholder="Details, supplier, delivery condition, or return notes"
                />
                <button
                  type="submit"
                  data-testid="field-material-submit"
                  disabled={selectedAssignment.kind !== "job" || busyAction !== null}
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Package className="h-4 w-4" />
                  {busyAction === "material" ? "Saving" : "Save material update"}
                </button>
              </form>

              <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <FieldQuickButton label="View job" icon={ClipboardCheck} onClick={() => onViewChange("jobs")} />
                <FieldQuickButton label="View inspection" icon={ClipboardCheck} onClick={() => onViewChange("inspections")} />
                <FieldQuickButton label="View property" icon={MapPin} onClick={() => onViewChange("customers")} />
                <FieldQuickButton label="Operations Queue" icon={AlertTriangle} onClick={() => onViewChange("operations")} testId="field-open-operations-queue" />
              </div>
            </div>
          ) : (
            <FieldEmptyState
              title="No assignment selected."
              detail="Choose a job or inspection from today's field work."
            />
          )}
        </section>
      </div>
    </div>
  );

}

function FieldMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "amber";
}) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${fieldSurfaceClass(tone)}`}>
      <p className="break-words text-xs font-bold uppercase tracking-[0.12em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function FieldFocusCard({
  title,
  assignment,
}: {
  title: string;
  assignment: FieldAssignment | null;
}) {
  return (
    <div className="min-w-0 min-h-28 rounded-xl border border-wt-border bg-wt-surface-muted p-3">
      <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-wt-muted">{title}</p>
      {assignment ? (
        <>
          <p className="mt-2 line-clamp-2 break-words text-sm font-black text-wt-ink">{assignment.title}</p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold text-wt-muted">
            {assignment.customerName} · {assignment.propertyAddress}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm font-semibold text-wt-muted">Nothing requires attention.</p>
      )}
    </div>
  );
}

function FieldInfoCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof MapPin;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-wt-border bg-wt-surface-muted p-3">
      <Icon className="h-4 w-4 shrink-0 text-orange-600" />
      <p className="mt-2 break-words text-xs font-bold uppercase tracking-[0.12em] text-wt-muted">{label}</p>
      <p className="mt-1 line-clamp-3 break-words text-sm font-bold text-wt-ink">{value}</p>
    </div>
  );
}

function FieldDetailBlock({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      className="min-w-0 rounded-xl border border-wt-border bg-wt-surface-muted p-3"
      data-testid={testId}
    >
      <h4 className="break-words font-black text-wt-ink">{title}</h4>
      <div className="mt-3 grid min-w-0 gap-2">{children}</div>
    </section>
  );
}

function FieldLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-wt-border bg-wt-surface p-3">
      <p className="break-words text-xs font-bold uppercase tracking-[0.12em] text-wt-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-wt-ink">{value}</p>
    </div>
  );
}

function FieldQuickButton({
  label,
  icon: Icon,
  onClick,
  testId,
}: {
  label: string;
  icon: typeof Phone;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-wt-border bg-wt-surface px-3 py-2 text-sm font-bold text-wt-ink transition hover:border-orange-200 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words text-center">{label}</span>
    </button>
  );
}

function MiniAction({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="min-h-10 min-w-0 rounded-lg border border-wt-border bg-wt-surface px-2 py-2 text-xs font-bold text-wt-ink transition hover:border-orange-200 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
    >
      {label}
    </button>
  );
}

function FieldPill({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "green" | "amber" | "red" | "slate";
}) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-lg px-2.5 py-1 text-xs font-black capitalize ${pillClass(tone)}`}>
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}

function FieldEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-dashed border-wt-border bg-wt-surface-muted p-5 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
      <p className="mt-3 break-words text-sm font-black text-wt-ink">{title}</p>
      <p className="mt-1 break-words text-sm text-wt-muted">{detail}</p>
    </div>
  );
}

function mapFieldStatusToJobStatus(status: FieldStatusAction): JobStatus {
  if (status === "work_completed") return "completed";
  if (status === "paused" || status === "unable_to_complete") return "blocked";
  if (status === "scheduled") return "scheduled";

  return "in_progress";
}

function mapChecklistActionToStatus(action: ChecklistAction): JobTaskRecord["status"] {
  if (action === "complete" || action === "not_applicable") {
    return "done";
  }

  if (action === "blocked") {
    return "in_progress";
  }

  return "todo";
}

function actionLabel(action: ChecklistAction) {
  return action.replace(/_/g, " ");
}

function createDemoJobNote(jobId: string, note: string): JobNoteRecord {
  return {
    id: `demo-field-note-${Date.now()}`,
    job_id: jobId,
    note,
    created_at: new Date().toISOString(),
  };
}

function formatTimeRange(assignment: FieldAssignment) {
  if (!assignment.scheduledStart && !assignment.scheduledEnd) {
    return "No scheduled time";
  }

  const start = assignment.scheduledStart
    ? new Date(assignment.scheduledStart).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "Start TBD";
  const end = assignment.scheduledEnd
    ? new Date(assignment.scheduledEnd).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "End TBD";

  return `${start} - ${end}`;
}

function uploadStateLabel(state: FieldUploadState) {
  if (state === "ready") return "Ready";
  if (state === "uploading") return "Uploading";
  if (state === "uploaded") return "Uploaded";

  return "Failed";
}

function statusTone(status: FieldStatusAction) {
  if (status === "work_completed") return "green" as const;
  if (status === "paused" || status === "unable_to_complete") return "red" as const;
  if (status === "arrived" || status === "work_started") return "blue" as const;

  return "slate" as const;
}

function fieldSurfaceClass(tone: "blue" | "green" | "amber") {
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-900";

  return "border-sky-200 bg-sky-50 text-sky-900";
}

function pillClass(tone: "blue" | "green" | "amber" | "red" | "slate") {
  if (tone === "green") return "bg-emerald-100 text-emerald-800";
  if (tone === "amber") return "bg-amber-100 text-amber-800";
  if (tone === "red") return "bg-red-100 text-red-800";
  if (tone === "blue") return "bg-sky-100 text-sky-800";

  return "bg-slate-100 text-slate-700";
}
