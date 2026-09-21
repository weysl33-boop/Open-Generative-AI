"use client";

import { Children, useRef } from "react";

import { cn } from "../ui/cn";
import { FOCUS_RING, FIELD_BASE, controlClasses } from "../ui/tokens";
import {
  PROMPT_CONTROL_LABEL_CLASS,
  PromptChevronIcon,
  PromptPopover,
  PromptPopoverHeader,
  promptControlClassName,
} from "./prompt/PromptComposer.jsx";

const FIELD_CLASS = cn(FIELD_BASE, controlClasses("sm", { pad: "px-2.5" }));

function createEmptyValue(schema = {}) {
  if (schema.default !== undefined) return schema.default;
  if (schema.type === "boolean") return false;
  if (schema.type === "array") return [];
  if (schema.type === "object") {
    return Object.fromEntries(
      Object.entries(schema.properties || {}).map(([key, property]) => [
        key,
        createEmptyValue(property),
      ]),
    );
  }
  if (["number", "integer", "int"].includes(schema.type)) return 0;
  return "";
}

function FieldLabel({ schema, inputKey }) {
  return (
    <div className="min-w-0">
      <div className="text-label text-ink-muted">
        {schema.title || inputKey.replaceAll("_", " ")}
      </div>
      {schema.description && (
        <div className="mt-0.5 text-caption text-ink-subtle">
          {schema.description}
        </div>
      )}
    </div>
  );
}

function ScalarInput({ schema, value, onChange, label }) {
  if (schema.enum) {
    return (
      <select
        className={FIELD_CLASS}
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => {
          const selected = schema.enum.find(
            (option) => String(option) === event.target.value,
          );
          onChange(selected);
        }}
      >
        {schema.emptyLabel && schema.default === undefined && (
          <option value="">{schema.emptyLabel}</option>
        )}
        {schema.enum.map((option) => (
          <option key={String(option)} value={String(option)}>
            {schema.optionLabels?.[option] || String(option)}
          </option>
        ))}
      </select>
    );
  }

  if (schema.type === "boolean") {
    return (
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={!!value}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          FOCUS_RING,
          value ? "border-brand-line bg-brand-soft" : "border-line bg-well",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full transition-transform",
            value ? "translate-x-5 bg-brand" : "translate-x-0 bg-ink-subtle",
          )}
        />
      </button>
    );
  }

  const numeric = ["number", "integer", "int"].includes(schema.type);
  return (
    <input
      className={FIELD_CLASS}
      aria-label={label}
      type={numeric ? "number" : "text"}
      value={value ?? ""}
      min={schema.minValue ?? schema.minimum}
      max={schema.maxValue ?? schema.maximum}
      step={schema.step || (schema.type === "number" ? "any" : 1)}
      placeholder={schema.examples?.[0] && typeof schema.examples[0] !== "object"
        ? String(schema.examples[0])
        : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function ArrayInput({ schema, value, onChange, label }) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = schema.items || { type: "string" };
  const maxItems = schema.maxItems ?? schema.max_items ?? Infinity;

  const updateItem = (index, nextValue) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? nextValue : item)));
  };

  const removeItem = (index) => {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div
          key={index}
          className="rounded-lg border border-line-subtle bg-surface p-2.5"
        >
          {itemSchema.type === "object" ? (
            <div className="flex flex-col gap-2">
              {Object.entries(itemSchema.properties || {}).map(([key, property]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-caption text-ink-subtle">
                    {property.title || key.replaceAll("_", " ")}
                  </span>
                  <ScalarInput
                    schema={property}
                    label={property.title || key.replaceAll("_", " ")}
                    value={item?.[key] ?? createEmptyValue(property)}
                    onChange={(nextValue) =>
                      updateItem(index, { ...item, [key]: nextValue })
                    }
                  />
                </label>
              ))}
            </div>
          ) : (
            <ScalarInput
              schema={itemSchema}
              label={`${label} ${index + 1}`}
              value={item}
              onChange={(nextValue) => updateItem(index, nextValue)}
            />
          )}
          <button
            type="button"
            onClick={() => removeItem(index)}
            aria-label={`Remove ${label} ${index + 1}`}
            className="mt-2 text-caption text-danger opacity-70 hover:opacity-100"
          >
            Remove
          </button>
        </div>
      ))}
      {items.length < maxItems && (
        <button
          type="button"
          onClick={() => onChange([...items, createEmptyValue(itemSchema)])}
          aria-label={`Add ${label}`}
          className={cn(
            "rounded-lg border border-dashed border-line px-3 py-2 text-label text-ink-subtle",
            "hover:border-brand-line hover:text-brand",
            FOCUS_RING,
          )}
        >
          + Add
        </button>
      )}
    </div>
  );
}

export default function ModelParameterControls({
  inputs,
  values,
  onChange,
  open,
  onToggle,
  children,
  label = <span className="text-caption font-black text-ink-muted">PARAMS</span>,
  title = "Model parameters",
  summary = inputs.length,
  fitViewport = false,
  solid = false,
  advancedKeys = [],
  advancedLabel = "Advanced",
  advancedChildren,
}) {
  const triggerRef = useRef(null);
  const extraControls = Children.toArray(children);
  const extraAdvancedControls = Children.toArray(advancedChildren);
  if (inputs.length === 0 && extraControls.length === 0 && extraAdvancedControls.length === 0) return null;
  const advancedKeySet = new Set(advancedKeys);
  const primaryInputs = [];
  const advancedInputs = [];
  for (const input of inputs) {
    (advancedKeySet.has(input.key) ? advancedInputs : primaryInputs).push(input);
  }
  const renderInput = ({ key, schema }) => (
    <div key={key} className="flex flex-col gap-2">
      <div className={schema.type === "boolean" ? "flex items-center justify-between gap-4" : "flex flex-col gap-2"}>
        <FieldLabel schema={schema} inputKey={key} />
        {schema.type === "array" ? (
          <ArrayInput
            schema={schema}
            label={schema.title || key.replaceAll("_", " ")}
            value={values[key]}
            onChange={(nextValue) => onChange(key, nextValue)}
          />
        ) : (
          <ScalarInput
            schema={schema}
            label={schema.title || key.replaceAll("_", " ")}
            value={values[key]}
            onChange={(nextValue) => onChange(key, nextValue)}
          />
        )}
      </div>
    </div>
  );

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (!open || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onToggle(event);
        triggerRef.current?.focus();
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        aria-expanded={open}
        onClick={onToggle}
        className={promptControlClassName({ active: open })}
      >
        <span className={PROMPT_CONTROL_LABEL_CLASS}>{label}</span>
        {summary !== "" && <span className={PROMPT_CONTROL_LABEL_CLASS}>{summary}</span>}
        <PromptChevronIcon />
      </button>
      {open && (
        <PromptPopover
          fitViewport={fitViewport}
          solid={solid}
          onClick={(event) => event.stopPropagation()}
          className="w-[min(420px,calc(100vw-2rem))] max-h-popover"
        >
          <PromptPopoverHeader>{title}</PromptPopoverHeader>
          <div className="flex flex-col gap-4">
            {extraControls}
            {primaryInputs.map(renderInput)}
            {(advancedInputs.length > 0 || extraAdvancedControls.length > 0) && (
              <details className="border-t border-line-subtle pt-2">
                <summary
                  className={cn(
                    "cursor-pointer py-2 text-label text-ink-muted",
                    FOCUS_RING,
                  )}
                >
                  {advancedLabel}
                </summary>
                <div className="flex flex-col gap-4 pt-2">
                  {advancedInputs.map(renderInput)}
                  {extraAdvancedControls}
                </div>
              </details>
            )}
          </div>
        </PromptPopover>
      )}
    </div>
  );
}
