// pixel-glass v3.6: làm các khung của trang trong suốt hẳn (nền, viền, bóng, đường kẻ) để cảnh pixel phía sau hiện rõ.
// Giữ nguyên: CHỈ ô nhập tin nhắn (nền và viền của nó), nút màu nổi bật, chip nhỏ.
// Hàng chọn model / quyền dưới ô nhập: chữ và nút còn, nền chỉ còn một lớp mờ nhẹ (đổi ROW_ALPHA nếu muốn), viền trong suốt.
// Không gọi mạng, không đọc/ghi cookie hay localStorage, không gửi dữ liệu đi đâu.
// Gỡ bỏ: gõ  pixelGlass.off()  hoặc tải lại app.
(() => {
  if (window.pixelGlass) window.pixelGlass.off()
  let done = new WeakSet()
  let backed = new WeakSet() // phần tử đang làm nền mờ cho hàng chọn model / quyền
  const ROW_ALPHA = 0.6 // độ đục của nền sau hàng chọn model / quyền (0 = trong suốt hẳn)
  const saved = [] // [phần tử, kiểu cũ (style) trước khi đổi]

  const rgb = s => {
    const m = /rgba?\(([^)]+)\)/.exec(s)
    if (!m) return null
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const edit = (el, props) => {
    saved.push([el, el.style.cssText])
    for (const k in props) el.style.setProperty(k, props[k], 'important')
  }

  // Ô nhập: hình viên thuốc quanh chỗ gõ chữ. Nếu khung bo tròn bao quanh nó còn chứa cả hàng chọn model
  // (cao hơn một ô nhập), thì nền và viền của khung đó được chuyển vào đúng ô nhập, để khung bao thành trong suốt.
  let keep = null
  let keepAt = -1e9
  // chỉ coi là trang chat khi có ô nhập tin nhắn lớn (không tính ô tìm kiếm nhỏ)
  const findEditor = () => {
    for (const q of document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')) {
      const r = q.getBoundingClientRect()
      if (r.width >= 300 && r.height >= 20) return q
    }
    return null
  }
  const OVERLAY = '[role="menu"], [role="dialog"], [role="listbox"], [role="tooltip"], [role="alertdialog"], [aria-modal="true"], [data-radix-popper-content-wrapper], [data-radix-portal]'
  const findKeep = () => {
    const ed = findEditor()
    if (!ed) return null
    let card = null
    for (let q = ed; q && q !== document.body; q = q.parentElement) {
      const r = q.getBoundingClientRect()
      if (r.width >= 300 && r.width < innerWidth * 0.95 && parseFloat(getComputedStyle(q).borderTopLeftRadius) >= 8) {
        card = q
        break
      }
    }
    if (!card) return ed
    const edH = ed.getBoundingClientRect().height
    // khung bo tròn chỉ cao hơn chỗ gõ chữ chút ít (lề) thì chính nó là ô nhập
    if (card.getBoundingClientRect().height - edH <= 40) return card
    let pill = ed
    for (let q = ed.parentElement; q && q !== card; q = q.parentElement) {
      const r = q.getBoundingClientRect()
      if (r.width >= 300 && r.height <= edH + 40) {
        pill = q
        break
      }
    }
    if (!done.has(pill)) {
      done.add(pill)
      const cs = getComputedStyle(card)
      const props = { 'border-radius': cs.borderTopLeftRadius }
      const bg = rgb(cs.backgroundColor)
      props['background-color'] = bg && bg.a >= 0.05 ? cs.backgroundColor : effectiveBg(card)
      if (parseFloat(cs.borderTopWidth) > 0) props.border = `${cs.borderTopWidth} solid ${cs.borderTopColor}`
      edit(pill, props)
    }
    return pill
  }
  const effectiveBg = el => {
    for (let q = el; q; q = q.parentElement) {
      const c = getComputedStyle(q).backgroundColor
      const v = rgb(c)
      if (v && v.a >= 0.5) return c
    }
    return 'transparent'
  }
  // Nếu màu nền của ô nhập thật ra là của khung bao quanh nó, ghim màu đó vào ô nhập trước khi khung bao thành trong suốt.
  const pinKeep = () => {
    const b = findKeep()
    if (!b || done.has(b)) return
    done.add(b)
    const own = rgb(getComputedStyle(b).backgroundColor)
    if (!own || own.a < 0.05) edit(b, { 'background-color': effectiveBg(b.parentElement || b) })
  }
  const inBox = el => {
    if (performance.now() - keepAt > 300) {
      keep = findKeep()
      keepAt = performance.now()
    }
    return keep !== null && keep.contains(el)
  }

  const fix = el => {
    if (!(el instanceof HTMLElement) || done.has(el)) return
    done.add(el)
    if (el.closest(OVERLAY)) return // menu, hộp thoại, gợi ý nổi: giữ nguyên
    if (inBox(el)) return // ô nhập: giữ nguyên
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const wide = r.width >= innerWidth * 0.3
    const thin = r.width >= 200 && r.height <= 4 // đường kẻ ngang mảnh
    if ((r.width < 24 || r.height < 24) && !thin) return // nút nhỏ, chip: giữ nguyên
    const props = {}
    const c = rgb(cs.backgroundColor)
    // hàng chọn model / quyền ngay dưới ô nhập: giữ một lớp nền mờ để chữ còn dễ đọc
    const underRow = () => {
      if (!keep || thin || (el.parentElement && backed.has(el.parentElement))) return false
      const k = keep.getBoundingClientRect()
      return r.top >= k.bottom - 4 && r.top <= k.bottom + 80 && r.height <= 90 && r.left >= k.left - 24 && r.right <= k.right + 24
    }
    let soft = false
    if (c && c.a >= 0.05) {
      if (!thin && Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 60) return // nút màu nổi bật (gửi, liên kết): giữ nguyên
      soft = underRow()
      props['background-color'] = soft ? `rgba(${c.r},${c.g},${c.b},${ROW_ALPHA})` : 'transparent'
      if (soft) backed.add(el)
    }
    if (cs.backgroundImage !== 'none') {
      if (/gradient\(/.test(cs.backgroundImage) && wide && r.height <= innerHeight * 0.4) props['background-image'] = 'none' // dải mờ dần phía trên ô nhập (không đụng thứ phủ kín cả cửa sổ)
      else return // ảnh: để nguyên
    }
    if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0) {
      props['border-color'] = 'transparent' // viền ngoài
    }
    if (cs.boxShadow !== 'none') props['box-shadow'] = 'none'
    if (soft) props['backdrop-filter'] = 'blur(6px)'
    else if (cs.backdropFilter !== 'none') props['backdrop-filter'] = 'none'
    if (Object.keys(props).length > 0) edit(el, props)
  }

  const walk = root => {
    pinKeep()
    fix(root)
    root.querySelectorAll && root.querySelectorAll('*').forEach(fix)
  }

  let queue = []
  let timer = 0
  const obs = new MutationObserver(list => {
    for (const m of list) m.addedNodes.forEach(n => n.nodeType === 1 && queue.push(n))
    if (!timer) {
      timer = setTimeout(() => {
        timer = 0
        const q = queue
        queue = []
        if (on) q.forEach(walk)
      }, 150)
    }
  })

  // Chỉ bật khi đang ở đoạn chat; sang trang khác (Plugins, Cài đặt...) thì trả lại nguyên trạng.
  let on = false
  const revert = () => {
    for (let i = saved.length - 1; i >= 0; i--) saved[i][0].style.cssText = saved[i][1]
    saved.length = 0
    done = new WeakSet()
    backed = new WeakSet()
    keep = null
    keepAt = -1e9
  }
  const sync = () => {
    const chat = findEditor() !== null
    if (chat && !on) {
      on = true
      walk(document.documentElement)
    } else if (!chat && on) {
      on = false
      queue = []
      revert()
    }
  }
  sync()
  const tick = setInterval(sync, 500)
  obs.observe(document.body, { childList: true, subtree: true })

  window.pixelGlass = {
    off() {
      obs.disconnect()
      clearTimeout(timer)
      clearInterval(tick)
      revert()
      delete window.pixelGlass
    },
  }
  console.log('pixel-glass v3.6: chỉ hoạt động trong đoạn chat. bật. Gõ pixelGlass.off() để gỡ.')
})()
