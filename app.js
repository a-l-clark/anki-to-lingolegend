(function () {
  "use strict";

  /* ---------- constants ---------- */
  var OUTPUT_COLUMNS = [
    { key: "topicName", label: "Topic Name", required: true, guess: ["deck"] },
    {
      key: "topicDesc",
      label: "Topic Description",
      required: false,
      guess: [],
    },
    { key: "topicType", label: "Topic Type", required: false, guess: [] },
    {
      key: "nativeText",
      label: "Native Text",
      required: true,
      guess: [
        "front",
        "word",
        "term",
        "expression",
        "native",
        "english",
        "question",
      ],
    },
    {
      key: "nativeContext",
      label: "Native Context Line",
      required: false,
      guess: [
        "example (native)",
        "native example",
        "context",
        "example sentence",
        "example",
      ],
    },
    {
      key: "translationText",
      label: "Translation Text",
      required: true,
      guess: [
        "back",
        "answer",
        "meaning",
        "translation",
        "target",
        "definition",
      ],
    },
    {
      key: "translationContext",
      label: "Translation Context Line",
      required: false,
      guess: [
        "example (translation)",
        "translated example",
        "translation example",
      ],
    },
    {
      key: "translationHint",
      label: "Translation Hint",
      required: false,
      guess: ["hint", "note", "notes", "mnemonic", "tip"],
    },
    {
      key: "pronunciation",
      label: "Pronunciation Override",
      required: false,
      guess: [
        "pronunciation",
        "reading",
        "furigana",
        "phonetic",
        "romaji",
        "ipa",
      ],
    },
  ];
  var CSV_HEADER =
    "Topic Name (Required),Topic Description (Optional),Topic Type (Optional),Native Text (Required),Native Context Line (Optional),Translation Text (Required),Translation Context Line (Optional),Translation Hint (Optional),Pronunciation Override (Optional)";
  var TOPIC_TYPES = [
    "0 - Vocab",
    "1 - Grammar",
    "2 - Phrases",
    "3 - Script",
    "4 - Misc",
  ];

  /* ---------- state ---------- */
  var state = {
    db: null,
    models: {}, // id -> {id, name, fields:[names]}
    decks: {}, // id -> {id, name}
    notes: [], // {id, mid, flds:[...], tags}
    deckIdByNote: {}, // noteId -> deckId
    selectedModels: {}, // mid -> bool
    selectedDecks: {}, // did -> bool
    mappings: {}, // mid -> { colKey: {type:'none'|'fixed'|'deck'|'tags'|'field', value, field} }
    topicDetails: {}, // topicName -> {desc, type}
    rows: [], // built export rows
    csv: "",
  };
  var currentStep = 0;

  /* ---------- step navigation ---------- */
  var steps = [0, 1, 2, 3, 4];
  function showStep(i) {
    steps.forEach(function (s) {
      document.getElementById("step" + s).hidden = s !== i;
    });
    document.querySelectorAll(".step-tab").forEach(function (tab) {
      var s = parseInt(tab.dataset.step, 10);
      tab.classList.toggle("active", s === i);
      tab.classList.toggle("done", s < i);
    });
    currentStep = i;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.getElementById("stepsNav").addEventListener("click", function (e) {
    var tab = e.target.closest(".step-tab");
    if (!tab) return;
    var s = parseInt(tab.dataset.step, 10);
    if (s <= currentStep && document.getElementById("step0-parsed"))
      showStep(s);
  });
  document.querySelectorAll("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () {
      showStep(Math.max(0, currentStep - 1));
    });
  });
  document.querySelectorAll("[data-next]").forEach(function (b) {
    b.addEventListener("click", function () {
      advanceFrom(currentStep);
    });
  });

  function advanceFrom(i) {
    if (i === 1) {
      buildMappingUI();
      showStep(2);
      return;
    }
    if (i === 2) {
      buildTopicsUI();
      showStep(3);
      return;
    }
    if (i === 3) {
      buildPreview();
      showStep(4);
      return;
    }
    showStep(Math.min(4, i + 1));
  }

  /* ---------- upload & parse ---------- */
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("fileInput");
  dropzone.addEventListener("click", function () {
    fileInput.click();
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.add("drag");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.remove("drag");
    });
  });
  dropzone.addEventListener("drop", function (e) {
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  function setUploadMsg(html, cls) {
    var el = document.getElementById("uploadMsg");
    el.innerHTML = html
      ? '<div class="msg ' + (cls || "info") + '">' + html + "</div>"
      : "";
  }

  var sqlJsReady = null;
  function getSqlJs() {
    if (!sqlJsReady) {
      sqlJsReady = initSqlJs({
        locateFile: function (f) {
          return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.5.0/" + f;
        },
      });
    }
    return sqlJsReady;
  }

  function handleFile(file) {
    if (!/\.apkg$/i.test(file.name)) {
      setUploadMsg(
        'That doesn\'t look like a .apkg file. Export your deck from Anki as an "Anki Deck Package" first.',
        "error",
      );
      return;
    }
    setUploadMsg(
      '<span class="spinner"></span>Reading ' + escapeHtml(file.name) + "…",
      "info",
    );
    parseApkg(file)
      .then(function () {
        setUploadMsg(
          "Loaded " +
            state.notes.length +
            " notes across " +
            Object.keys(state.models).length +
            " note type(s) and " +
            Object.keys(state.decks).length +
            " deck(s).",
          "info",
        );
        document.getElementById("step0-parsed");
        var marker = document.createElement("span");
        marker.id = "step0-parsed";
        marker.style.display = "none";
        document.getElementById("step0").appendChild(marker);
        buildSelectUI();
        showStep(1);
      })
      .catch(function (err) {
        console.error(err);
        setUploadMsg(
          "Couldn't read that file: " + escapeHtml(err.message || String(err)),
          "error",
        );
      });
  }

  function parseApkg(file) {
    return file
      .arrayBuffer()
      .then(function (buf) {
        return JSZip.loadAsync(buf);
      })
      .then(function (zip) {
        var isZstd = false;
        var entry =
          zip.file("collection.anki21") || zip.file("collection.anki2");
        if (!entry) {
          entry = zip.file("collection.anki21b");
          isZstd = true;
        }
        if (!entry)
          throw new Error(
            "No collection database found inside this .apkg (expected collection.anki2, .anki21, or .anki21b).",
          );
        return entry.async("uint8array").then(function (bytes) {
          return { bytes: bytes, isZstd: isZstd };
        });
      })
      .then(function (res) {
        var bytes = res.bytes;
        if (res.isZstd) {
          if (!window.fzstd)
            throw new Error(
              "This deck uses the newer compressed Anki format, and the decompression library didn't load (check your internet connection and reload the page).",
            );
          bytes = fzstd.decompress(bytes);
        }
        return getSqlJs().then(function (SQL) {
          state.db = new SQL.Database(bytes);
          loadModelsAndDecks();
          loadNotesAndCards();
        });
      });
  }

  function queryAll(sql) {
    var res = state.db.exec(sql);
    if (!res.length) return [];
    var cols = res[0].columns,
      vals = res[0].values;
    return vals.map(function (row) {
      var o = {};
      cols.forEach(function (c, i) {
        o[c] = row[i];
      });
      return o;
    });
  }

  function normalizeModels(raw) {
    var out = {};
    Object.keys(raw || {}).forEach(function (id) {
      var m = raw[id];
      var flds = (m.flds || [])
        .slice()
        .sort(function (a, b) {
          return (a.ord || 0) - (b.ord || 0);
        })
        .map(function (f) {
          return f.name;
        });
      out[id] = { id: id, name: m.name, fields: flds };
    });
    return out;
  }
  function normalizeDecks(raw) {
    var out = {};
    Object.keys(raw || {}).forEach(function (id) {
      var d = raw[id];
      out[id] = { id: id, name: (d.name || "").split("::").join(" :: ") };
    });
    return out;
  }

  function loadModelsAndDecks() {
    var models = {},
      decks = {};
    try {
      var colRows = queryAll("SELECT models, decks FROM col");
      if (colRows.length) {
        if (colRows[0].models) models = JSON.parse(colRows[0].models);
        if (colRows[0].decks) decks = JSON.parse(colRows[0].decks);
      }
    } catch (e) {
      /* fall through to normalized tables */
    }

    if (!models || !Object.keys(models).length) {
      try {
        var nt = queryAll("SELECT id, name FROM notetypes");
        var flds = queryAll(
          "SELECT ntid, name, ord FROM fields ORDER BY ntid, ord",
        );
        var byNt = {};
        flds.forEach(function (f) {
          byNt[f.ntid] = byNt[f.ntid] || [];
          byNt[f.ntid][f.ord] = f.name;
        });
        nt.forEach(function (m) {
          var fArr = (byNt[m.id] || [])
            .map(function (n, ord) {
              return { name: n, ord: ord };
            })
            .filter(function (f) {
              return f.name != null;
            });
          models[m.id] = { name: m.name, flds: fArr };
        });
      } catch (e) {
        /* ignore */
      }
    }
    if (!decks || !Object.keys(decks).length) {
      try {
        var dRows = queryAll("SELECT id, name FROM decks");
        dRows.forEach(function (d) {
          decks[d.id] = { name: d.name };
        });
      } catch (e) {
        /* ignore */
      }
    }

    state.models = normalizeModels(models);
    state.decks = normalizeDecks(decks);
  }

  function loadNotesAndCards() {
    var noteRows = queryAll("SELECT id, mid, flds, tags FROM notes");
    state.notes = noteRows.map(function (n) {
      var tagStr = (n.tags || "").trim();
      var tagList = tagStr ? tagStr.split(/\s+/).filter(Boolean) : [];
      return {
        id: n.id,
        mid: String(n.mid),
        flds: String(n.flds).split("\x1f"),
        tags: tagStr,
        tagList: tagList,
      };
    });
    var cardRows = queryAll("SELECT nid, did FROM cards ORDER BY id");
    var map = {};
    cardRows.forEach(function (c) {
      if (map[c.nid] === undefined) map[c.nid] = String(c.did);
    });
    state.deckIdByNote = map;
  }

  /* ---------- step 1: select ---------- */
  function buildSelectUI() {
    // count notes per model, and which decks each model appears in
    var modelStats = {}; // mid -> {count, decks:Set}
    var deckStats = {}; // did -> count
    state.notes.forEach(function (n) {
      var did = state.deckIdByNote[n.id];
      modelStats[n.mid] = modelStats[n.mid] || { count: 0, decks: {} };
      modelStats[n.mid].count++;
      if (did != null) modelStats[n.mid].decks[did] = true;
      if (did != null) deckStats[did] = (deckStats[did] || 0) + 1;
    });

    var modelHost = document.getElementById("modelChecklist");
    modelHost.innerHTML = "";
    Object.keys(state.models).forEach(function (mid) {
      if (!modelStats[mid]) return; // model unused
      state.selectedModels[mid] = true;
      var m = state.models[mid];
      var deckNames = Object.keys(modelStats[mid].decks)
        .map(function (d) {
          return state.decks[d] ? state.decks[d].name : "?";
        })
        .join(", ");
      var label = document.createElement("label");
      label.innerHTML =
        '<input type="checkbox" checked data-model="' +
        mid +
        '"> <span><strong>' +
        escapeHtml(m.name) +
        "</strong> — fields: " +
        escapeHtml(m.fields.join(", ")) +
        '<br><span style="color:var(--muted); font-size:12px;">used in: ' +
        escapeHtml(deckNames || "—") +
        '</span></span><span class="meta">' +
        modelStats[mid].count +
        " notes</span>";
      modelHost.appendChild(label);
    });
    modelHost.addEventListener("change", function (e) {
      var cb = e.target.closest("input[data-model]");
      if (!cb) return;
      state.selectedModels[cb.dataset.model] = cb.checked;
      updateSelectStats();
    });

    var deckHost = document.getElementById("deckChecklist");
    deckHost.innerHTML = "";
    Object.keys(deckStats)
      .sort(function (a, b) {
        return deckStats[b] - deckStats[a];
      })
      .forEach(function (did) {
        state.selectedDecks[did] = true;
        var d = state.decks[did] || { name: "Unknown deck" };
        var label = document.createElement("label");
        label.innerHTML =
          '<input type="checkbox" checked data-deck="' +
          did +
          '"> <span><strong>' +
          escapeHtml(d.name) +
          '</strong></span><span class="meta">' +
          deckStats[did] +
          " notes</span>";
        deckHost.appendChild(label);
      });
    deckHost.addEventListener("change", function (e) {
      var cb = e.target.closest("input[data-deck]");
      if (!cb) return;
      state.selectedDecks[cb.dataset.deck] = cb.checked;
      updateSelectStats();
    });

    var tagCounts = {};
    state.notes.forEach(function (n) {
      n.tagList.forEach(function (t) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });
    var tagNames = Object.keys(tagCounts).sort(function (a, b) {
      return tagCounts[b] - tagCounts[a];
    });
    var chipHost = document.getElementById("tagChips");
    if (!tagNames.length) {
      chipHost.innerHTML =
        '<span class="none">No tags found in this deck.</span>';
    } else {
      chipHost.innerHTML = tagNames
        .map(function (t) {
          return (
            '<span class="chip">' +
            escapeHtml(t) +
            '<span class="n">' +
            tagCounts[t] +
            "</span></span>"
          );
        })
        .join("");
    }

    updateSelectStats();
  }

  function includedNotes() {
    return state.notes.filter(function (n) {
      var did = state.deckIdByNote[n.id];
      return state.selectedModels[n.mid] && state.selectedDecks[did];
    });
  }

  function updateSelectStats() {
    var n = includedNotes().length;
    document.getElementById("selectStats").innerHTML =
      '<div class="stat"><div class="num">' +
      n +
      '</div><div class="lbl">cards will be exported</div></div>';
    document.getElementById("toMapBtn").disabled = n === 0;
  }

  /* ---------- step 2: mapping ---------- */
  function guessSource(fieldNames, guessKeywords) {
    var lower = fieldNames.map(function (f) {
      return f.toLowerCase();
    });
    for (var k = 0; k < guessKeywords.length; k++) {
      var kw = guessKeywords[k];
      var idx = lower.findIndex(function (f) {
        return f.indexOf(kw) > -1;
      });
      if (idx > -1) return idx;
    }
    return -1;
  }

  function buildMappingUI() {
    var host = document.getElementById("mappingHost");
    host.innerHTML = "";
    var activeModels = Object.keys(state.selectedModels).filter(function (m) {
      return state.selectedModels[m];
    });

    activeModels.forEach(function (mid) {
      var model = state.models[mid];
      if (!model) return;
      if (!state.mappings[mid]) state.mappings[mid] = {};
      var modelTagSet = {};
      state.notes.forEach(function (n) {
        if (n.mid === mid)
          n.tagList.forEach(function (t) {
            modelTagSet[t] = true;
          });
      });
      var modelTags = Object.keys(modelTagSet).sort();

      var details = document.createElement("details");
      details.className = "nt-block";
      details.open = activeModels.length <= 2;
      var count = state.notes.filter(function (n) {
        return n.mid === mid;
      }).length;
      details.innerHTML =
        "<summary>" +
        escapeHtml(model.name) +
        ' <span class="count">' +
        count +
        " notes · " +
        model.fields.length +
        " fields</span></summary>";
      var body = document.createElement("div");
      body.className = "nt-body";

      var table = document.createElement("table");
      table.className = "map-table";
      table.innerHTML =
        '<thead><tr><th style="width:30%">Lingo Legend column</th><th>Source</th></tr></thead>';
      var tbody = document.createElement("tbody");

      OUTPUT_COLUMNS.forEach(function (col) {
        console.log(col);
        if (col.key === "topicDesc" || col.key === "topicType") return; // these are handled in step 3
        var existing = state.mappings[mid][col.key];
        if (!existing) {
          var guessIdx =
            col.guess.indexOf("deck") > -1
              ? -1
              : guessSource(model.fields, col.guess);
          if (col.key === "topicName") {
            existing = { type: "deck" };
          } else if (guessIdx > -1) {
            existing = { type: "field", field: model.fields[guessIdx] };
          } else {
            existing = { type: "none" };
          }
          state.mappings[mid][col.key] = existing;
        }

        var tr = document.createElement("tr");
        var tdLabel = document.createElement("td");
        tdLabel.className = "label";
        tdLabel.innerHTML =
          col.label + (col.required ? '<span class="req">*</span>' : "");
        tr.appendChild(tdLabel);

        var tdSel = document.createElement("td");
        var sel = document.createElement("select");
        sel.dataset.model = mid;
        sel.dataset.col = col.key;
        var opts = '<option value="">— leave blank —</option>';
        opts += '<option value="deck">Deck name</option>';
        opts += '<option value="fixed">Fixed text…</option>';
        opts += '<optgroup label="Anki tags">';
        opts += '<option value="tags:all">All tags (space-separated)</option>';
        opts += '<option value="tags:first">First tag only</option>';
        modelTags.forEach(function (t) {
          opts +=
            '<option value="tags:has:' +
            escapeHtml(t) +
            '">Tag: ' +
            escapeHtml(t) +
            "</option>";
        });
        opts += "</optgroup>";
        opts += '<optgroup label="Anki fields">';
        model.fields.forEach(function (f, i) {
          opts +=
            '<option value="field:' + i + '">' + escapeHtml(f) + "</option>";
        });
        opts += "</optgroup>";
        sel.innerHTML = opts;

        if (existing.type === "field") {
          var idx = model.fields.indexOf(existing.field);
          sel.value = idx > -1 ? "field:" + idx : "";
        } else if (existing.type === "fixed") {
          sel.value = "fixed";
        } else if (existing.type === "tags") {
          sel.value =
            existing.mode === "has"
              ? "tags:has:" + existing.value
              : "tags:" + (existing.mode || "all");
        } else {
          sel.value = existing.type === "none" ? "" : existing.type;
        }

        var fixedInput = document.createElement("input");
        fixedInput.type = "text";
        fixedInput.className = "fixed-input";
        fixedInput.placeholder = "Text to use for every row…";
        fixedInput.hidden = existing.type !== "fixed";
        fixedInput.value =
          existing.type === "fixed" ? existing.value || "" : "";
        fixedInput.dataset.model = mid;
        fixedInput.dataset.col = col.key;

        sel.addEventListener("change", function () {
          var val = sel.value;
          var m = { type: "none" };
          if (val === "deck") m = { type: "deck" };
          else if (val === "fixed")
            m = { type: "fixed", value: fixedInput.value };
          else if (val === "tags:all") m = { type: "tags", mode: "all" };
          else if (val === "tags:first") m = { type: "tags", mode: "first" };
          else if (val.indexOf("tags:has:") === 0)
            m = {
              type: "tags",
              mode: "has",
              value: val.slice("tags:has:".length),
            };
          else if (val.indexOf("field:") === 0)
            m = {
              type: "field",
              field: model.fields[parseInt(val.split(":")[1], 10)],
            };
          state.mappings[mid][col.key] = m;
          fixedInput.hidden = val !== "fixed";
        });
        fixedInput.addEventListener("input", function () {
          if (state.mappings[mid][col.key].type === "fixed") {
            state.mappings[mid][col.key].value = fixedInput.value;
          }
        });

        tdSel.appendChild(sel);
        tdSel.appendChild(fixedInput);
        tr.appendChild(tdSel);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      body.appendChild(table);
      details.appendChild(body);
      host.appendChild(details);
    });
  }

  /* ---------- text cleanup ---------- */
  var scratchArea = document.createElement("textarea");
  function decodeEntities(str) {
    scratchArea.innerHTML = str;
    return scratchArea.value;
  }

  function cleanAnkiText(raw) {
    if (!raw) return "";
    var t = raw;
    t = t.replace(/\[sound:[^\]]*\]/gi, "");
    t = t.replace(/\[\$\$?\][\s\S]*?\[\/\$\$?\]/gi, "");
    t = t.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/gi, "$1");
    t = t.replace(/<br\s*\/?>/gi, " ");
    t = t.replace(/<\/(div|p|li|tr)>/gi, " ");
    t = t.replace(/<[^>]+>/g, "");
    t = decodeEntities(t);
    t = t
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, " ")
      .trim();
    return t;
  }

  function extractFurigana(text) {
    var readings = [];
    var plain = text.replace(
      /([^\s\[\]]+)\[([^\]]+)\]/g,
      function (m, base, kana) {
        readings.push(kana);
        return base;
      },
    );
    return { plain: plain, reading: readings.join("") };
  }

  /* ---------- resolving rows ---------- */
  function fieldIndexMap(model) {
    var m = {};
    model.fields.forEach(function (name, i) {
      m[name] = i;
    });
    return m;
  }

  function resolveValue(note, model, fim, mapping) {
    if (!mapping || mapping.type === "none") return "";
    if (mapping.type === "fixed") return mapping.value || "";
    if (mapping.type === "deck") {
      var did = state.deckIdByNote[note.id];
      return (state.decks[did] && state.decks[did].name) || "";
    }
    if (mapping.type === "tags") {
      if (mapping.mode === "first") return note.tagList[0] || "";
      if (mapping.mode === "has") {
        var found = note.tagList.filter(function (t) {
          return t === mapping.value || t.indexOf(mapping.value + "::") === 0;
        });
        return found.join(", ");
      }
      return note.tagList.join(", ");
    }
    if (mapping.type === "field") {
      var idx = fim[mapping.field];
      return idx != null ? note.flds[idx] || "" : "";
    }
    return "";
  }

  function computeRawRows() {
    var doClean = document.getElementById("optClean").checked;
    var doFurigana = document.getElementById("optFurigana").checked;
    var notes = includedNotes();
    var rows = [];
    notes.forEach(function (note) {
      var model = state.models[note.mid];
      var mapping = state.mappings[note.mid];
      if (!model || !mapping) return;
      var fim = fieldIndexMap(model);
      var row = {};
      OUTPUT_COLUMNS.forEach(function (col) {
        var v = resolveValue(note, model, fim, mapping[col.key]);
        row[col.key] = doClean ? cleanAnkiText(v) : (v || "").trim();
      });
      if (doFurigana) {
        var pronMapped =
          mapping.pronunciation && mapping.pronunciation.type !== "none";
        if (
          !pronMapped &&
          row.translationText &&
          /\[[^\]]+\]/.test(row.translationText)
        ) {
          var r1 = extractFurigana(row.translationText);
          row.translationText = r1.plain;
          if (!row.pronunciation) row.pronunciation = r1.reading;
        }
        if (
          !pronMapped &&
          row.nativeText &&
          /\[[^\]]+\]/.test(row.nativeText)
        ) {
          var r2 = extractFurigana(row.nativeText);
          row.nativeText = r2.plain;
          if (!row.pronunciation) row.pronunciation = r2.reading;
        }
      }
      rows.push(row);
    });
    return rows;
  }

  /* ---------- step 3: topic details ---------- */
  function buildTopicsUI() {
    var rows = computeRawRows();
    var order = [];
    var seen = {};
    rows.forEach(function (r) {
      var name = r.topicName || "(untitled topic)";
      if (!seen[name]) {
        seen[name] = true;
        order.push(name);
      }
    });
    var tbody = document.querySelector("#topicsTable tbody");
    tbody.innerHTML = "";
    order.forEach(function (name) {
      if (!state.topicDetails[name])
        state.topicDetails[name] = { desc: "", type: "" };
      var tr = document.createElement("tr");
      var det = state.topicDetails[name];
      var tdName = document.createElement("td");
      tdName.className = "name";
      tdName.textContent = name;
      var tdDesc = document.createElement("td");
      var descInput = document.createElement("input");
      descInput.type = "text";
      descInput.value = det.desc;
      descInput.dataset.topic = name;
      descInput.dataset.field = "desc";
      tdDesc.appendChild(descInput);
      var tdType = document.createElement("td");
      var typeSelect = document.createElement("select");
      typeSelect.dataset.topic = name;
      typeSelect.dataset.field = "type";
      var typeOpts = '<option value="">— leave blank —</option>';
      TOPIC_TYPES.forEach(function (t) {
        typeOpts +=
          '<option value="' +
          escapeHtml(t) +
          '">' +
          escapeHtml(t) +
          "</option>";
      });
      typeSelect.innerHTML = typeOpts;
      typeSelect.value = TOPIC_TYPES.indexOf(det.type) > -1 ? det.type : "";
      tdType.appendChild(typeSelect);
      tr.appendChild(tdName);
      tr.appendChild(tdDesc);
      tr.appendChild(tdType);
      tbody.appendChild(tr);
    });
    tbody.addEventListener("input", function (e) {
      var inp = e.target;
      if (!inp.dataset.topic) return;
      state.topicDetails[inp.dataset.topic][inp.dataset.field] = inp.value;
    });
    tbody.addEventListener("change", function (e) {
      var inp = e.target;
      if (!inp.dataset.topic || inp.tagName !== "SELECT") return;
      state.topicDetails[inp.dataset.topic][inp.dataset.field] = inp.value;
    });
  }

  /* ---------- step 4: preview + export ---------- */
  function csvField(v) {
    v = v == null ? "" : String(v);
    if (/[",\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function buildFinalRows() {
    var raw = computeRawRows();
    // group by topic name preserving first-seen order, so desc/type only appear once per contiguous group
    var groups = [];
    var index = {};
    raw.forEach(function (r) {
      var name = r.topicName || "(untitled topic)";
      if (index[name] === undefined) {
        index[name] = groups.length;
        groups.push({ name: name, rows: [] });
      }
      groups[index[name]].rows.push(r);
    });
    var out = [];
    groups.forEach(function (g) {
      var det = state.topicDetails[g.name] || { desc: "", type: "" };
      g.rows.forEach(function (r, i) {
        var row = Object.assign({}, r);
        if (i === 0) {
          if (det.desc) row.topicDesc = det.desc;
          if (det.type) row.topicType = det.type;
        } else {
          row.topicDesc = "";
          row.topicType = "";
        }
        out.push(row);
      });
    });
    return out;
  }

  function buildPreview() {
    state.rows = buildFinalRows();
    var lines = [CSV_HEADER];
    state.rows.forEach(function (r) {
      lines.push(
        OUTPUT_COLUMNS.map(function (c) {
          return csvField(r[c.key]);
        }).join(","),
      );
    });
    state.csv = lines.join("\r\n");

    document.getElementById("exportStats").innerHTML =
      '<div class="stat"><div class="num">' +
      state.rows.length +
      '</div><div class="lbl">rows</div></div>' +
      '<div class="stat"><div class="num">' +
      Object.keys(state.topicDetails).length +
      '</div><div class="lbl">topics</div></div>';

    var table = document.getElementById("previewTable");
    var thead =
      "<thead><tr>" +
      OUTPUT_COLUMNS.map(function (c) {
        return "<th>" + escapeHtml(c.label) + "</th>";
      }).join("") +
      "</tr></thead>";
    var body =
      "<tbody>" +
      state.rows
        .slice(0, 50)
        .map(function (r) {
          return (
            "<tr>" +
            OUTPUT_COLUMNS.map(function (c) {
              return (
                '<td title="' +
                escapeHtml(r[c.key] || "") +
                '">' +
                escapeHtml(r[c.key] || "") +
                "</td>"
              );
            }).join("") +
            "</tr>"
          );
        })
        .join("") +
      "</tbody>";
    table.innerHTML = thead + body;
  }

  document.getElementById("downloadBtn").addEventListener("click", function () {
    var blob = new Blob(["\uFEFF" + state.csv], {
      type: "text/csv;charset=utf-8;",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "lingo-legend-cards.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /* ---------- utils ---------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
})();
