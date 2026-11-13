/**
 * The follow hand-back and the stream glide (packages/client/src/features/chat-follow/):
 * a structural moment hands the host’s follow back, a reader who took the scroll
 * over himself is left where he is, and the growth a fast answer brings is slid to
 * rest instead of jumping a frame (D85).
 */
(function () {
  var probe = window.__dshSmokeProbe
  var r = probe.report

  probe.step(async function () {
    // The chat area's own message of this page load: a step of its own, so a
    // submission the host mounts has run by the time the slide below reads it.
    await probe.onlyFor(['chat-follow'], async function () {
      var chatFlow = document.querySelector('[data-chat-flow]')
      var chatScroller = document.querySelector('[data-conversation-scroll]')
      var chatRunning = document.querySelector('[data-chat-running]')
      var chatEchoOf = function () { return document.querySelector('[data-echo-holder]') }
      var userRow = document.createElement('div')
      userRow.setAttribute('data-chat-flow-key', 'sent')
      userRow.setAttribute('data-chat-flow-kind', 'user')
      userRow.style.height = '300px'
      var slidesOf = function () { return chatFlow.getAnimations().length }
      // A message the reader has just sent is not streaming content: the host's
      // jump to it stands, and the slide stands down around it. The streaming
      // mark is still on the page here, so without the stand-down this growth
      // would slide like any other. The stand-down is the engine's own
      // submission hold, and the sequence is the page's: Enter in the editor, the
      // echo the host mounts in answer, the row that takes its place.
      var editor = document.querySelector('[data-composer-input]')
      if (editor !== null) {
        editor.focus()
      }
      chatEchoOf().innerHTML = '<div data-submission-echo></div>'
      chatScroller.scrollTop = chatScroller.scrollHeight
      var echo = await probe.watch(slidesOf)
      chatEchoOf().innerHTML = ''
      chatFlow.insertBefore(userRow, chatRunning)
      chatScroller.scrollTop = chatScroller.scrollHeight
      var row = await probe.watch(slidesOf)
      userRow.remove()
      await probe.settle()
      r.chatFollowSubmit = { echo: echo, row: row }
    })
    // The ported chat-follow feature (packages/client/src/features/chat-follow/): a structural
    // moment hands the host's follow back, and a reader who took the scroll
    // over himself is left where he is.
    await probe.onlyFor(['chat-follow'], async function () {
      var followScroller = document.querySelector('[data-conversation-scroll]')
      var followColumn = document.querySelector('[data-chat-flow]')
      var followButton = document.querySelector('#debugTail button')
      var cappedBody = document.querySelector('[data-step-process]:not([data-group-expanded-mode]) [data-step-process-body]')
      var expandedBody = document.querySelector('[data-step-process][data-group-expanded-mode] [data-step-process-body]')
      var endGap = function () {
        return Math.round(followScroller.scrollHeight - followScroller.clientHeight - followScroller.scrollTop)
      }
      /** What "at rest" means for a position, as the cases read it (bounds.json's followAtEndPx). */
      var AT_END_PX = 6
      // One walk, as the browser draws it: the first reading is taken where the
      // walk starts, the rest on the frames that follow, and the recording stops
      // on a run of frames that read the same position. D87's 动效的断言 reads
      // this sequence — monotone, at least two different values between the two
      // ends, the end equal to the target — so that the shape of the curve is
      // settled in the unit lane and this lane only asks whether it was walked.
      //
      // A walk out of a growth begins on the frame the content is laid out in,
      // when the size subscription armed after the host's own starts it — so the
      // recording waits for the frame `held` says it began on. Started in the
      // writing turn, it reads the state before the walk and never sees it.
      var recordWalk = function (gap, held) {
        return new Promise(function (resolve) {
          var readings = []
          var quiet = 0
          var frames = 0
          var started = false
          var read = function () {
            frames += 1
            if (!started) {
              started = held()
              if (!started) {
                if (frames >= 96) { resolve([]); return }
                requestAnimationFrame(read)
                return
              }
            }
            var value = gap()
            readings.push(value)
            if (readings.length > 1 && value === readings[readings.length - 2]) quiet += 1
            else quiet = 0
            // The quiet run is what ends a walk: a fixed wait would either cut a
            // slow runner's walk short or spend a second on a fast one.
            if (quiet >= 8 || readings.length >= 120) { resolve(readings); return }
            requestAnimationFrame(read)
          }
          requestAnimationFrame(read)
        })
      }
      /** Whether the capped body has left its end, which is where its catch-up walk starts. */
      var bodyWalking = function () {
        return cappedBody !== null && cappedBody.scrollHeight - cappedBody.clientHeight - cappedBody.scrollTop > 6
      }
      var structuralMoment = async function () {
        var node = document.createElement('div')
        node.setAttribute('data-chat-flow-key', 'probe')
        node.style.display = 'none'
        followColumn.appendChild(node)
        // Two hand-backs never land closer than the follow's own interval
        // (FOLLOW_MIN_INTERVAL_MS, a fifth of a second): the moment is held past
        // it, which is the product's clock, before it is taken away again.
        await probe.sleep(250)
        followColumn.removeChild(node)
        await probe.settle()
      }
      r.chatFollow = {
        marked: document.body.hasAttribute('data-dsh-claude-chat-follow'),
        overflowX: cappedBody === null ? null : getComputedStyle(cappedBody).overflowX,
        expandedOverflowX: expandedBody === null ? null : getComputedStyle(expandedBody).overflowX,
      }
      // At the end, so any reader-took-over the guard is holding is dropped.
      followScroller.scrollTop = followScroller.scrollHeight
      await probe.settle()
      await structuralMoment()
      // 60px off the end, the way a structural moment leaves it.
      followScroller.scrollTop = Math.max(0, followScroller.scrollHeight - followScroller.clientHeight - 60)
      await probe.settle()
      r.chatFollow.before = endGap()
      await structuralMoment()
      r.chatFollow.after = endGap()
      // A wheel of the reader's own: the hand-back stops until he returns.
      followScroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
      followScroller.scrollTop = Math.max(0, followScroller.scrollHeight - followScroller.clientHeight - 60)
      await probe.settle()
      r.chatFollow.readerBefore = endGap()
      await structuralMoment()
      r.chatFollow.readerAfter = endGap()
      // The reader presses the host's own back-to-end button. Its click is the
      // host's returnToBottom: the follow mark comes back and the position goes
      // to the tail. The growth after it belongs to the host's follow; the
      // owner's held position must not be written over the new tail. The page
      // stands in for the host's own write: the button handler is the only
      // place a position is written here, as returnToBottom is on the host.
      var returnGap = function () {
        var row = document.createElement('div')
        row.setAttribute('data-chat-flow-key', 'return-growth')
        row.style.height = '300px'
        var pressAndGrow = function () {
          followButton.click()
          followColumn.appendChild(row)
          // The host's follow pins the end when its column grows.
          followScroller.scrollTop = followScroller.scrollHeight
          return probe.sleep(160).then(function () {
            var gap = endGap()
            row.remove()
            followScroller.scrollTop = followScroller.scrollHeight
            return gap
          })
        }
        followScroller.scrollTop = 0
        followScroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -400 }))
        followScroller.scrollTop = 0
        return pressAndGrow()
      }
      var followingWasOn = followColumn.parentElement.hasAttribute('data-chat-following-tail')
      // The host's button is drawn only while its follow is off, which a click
      // here also settles: the button stands in the page's own frame.
      followButton.style.display = 'inline-block'
      // The host's returnToBottom: the follow mark comes on and the position
      // lands at the tail, once, when the button is pressed.
      followButton.addEventListener('click', function () {
        followColumn.parentElement.setAttribute('data-chat-following-tail', '')
        followScroller.scrollTop = followScroller.scrollHeight
      })
      r.chatFollow.returnToBottom = { followingWasOn: followingWasOn, gap: await returnGap() }
      // The capped body's catch-up is walked in on a curve, not written in one
      // frame (scroll-ease.ts): put the body at its own end, let the follower
      // read that, then grow the content well past the catch-up threshold and
      // record every frame of the walk out of it (process-follow.ts, D100).
      if (cappedBody !== null) {
        var cappedContent = cappedBody.querySelector('[data-step-process-content]')
        var bodyGap = function () {
          return Math.round(cappedBody.scrollHeight - cappedBody.clientHeight - cappedBody.scrollTop)
        }
        cappedBody.scrollTop = cappedBody.scrollHeight
        await probe.settle()
        if (cappedContent !== null) cappedContent.style.height = '900px'
        r.chatFollow.catchUp = await recordWalk(bodyGap, bodyWalking)
      }
      // The stream slide (chat-follow.ts, D85): with the host's own streaming mark
      // on the page and its follow on, the growth the host's pin pushed up is put
      // back down by the column's own offset and slid to rest, while the position
      // stays at the end. The live turn's row, the flow's last, stands still.
      followScroller.scrollTop = followScroller.scrollHeight
      await probe.settle()
      // The host's own mark that its follow is on, which it writes on the
      // column's wrapper; the slide only moves a growth the host has pinned.
      followColumn.parentElement.setAttribute('data-chat-following-tail', '')
      var streamingMark = document.createElement('div')
      streamingMark.setAttribute('data-streaming', '')
      followColumn.appendChild(streamingMark)
      var runningRow = document.createElement('div')
      runningRow.setAttribute('data-chat-running', '')
      runningRow.style.height = '24px'
      followColumn.appendChild(runningRow)
      followScroller.scrollTop = followScroller.scrollHeight
      await probe.settle()
      var slideBlock = document.createElement('div')
      slideBlock.style.height = '300px'
      followColumn.insertBefore(slideBlock, runningRow)
      /** The column's offset as it renders, with the end gap and the running row's top on the same frame. */
      var slideFrames = []
      var slideOffset = function () {
        slideFrames.push({ gap: endGap(), row: runningRow.getBoundingClientRect().top })
        return Math.round(new DOMMatrix(getComputedStyle(followColumn).transform).m42 * 10) / 10
      }
      var sliding = function () {
        return followColumn.getAnimations().length > 0
      }
      // The pin the host's own follow writes; the slide starts in the frame it
      // is laid out in, and is recorded from there the same way as the catch-up.
      followScroller.scrollTop = followScroller.scrollHeight
      r.chatFollow.slide = await recordWalk(slideOffset, sliding)
      r.chatFollow.slideFrames = slideFrames
      r.chatFollow.slideDiag = {
        motion: document.body.getAttribute('data-dsh-claude-motion'),
        streamMark: document.querySelector('[data-streaming]') !== null,
        rolling: document.querySelector('[data-dsh-claude-rolling]') !== null,
        followAttr: document.querySelector('[data-chat-following-tail]') !== null,
      }
      // A burst: one growth past the longest stretch a slide carries is slid
      // too, from as much of it as a slide carries (chat-follow.ts), where a
      // growth that size used to read as a replaced column and jumped whole.
      // The lag recorded is the growth still to be put down: the column's
      // offset while its slide runs, and the whole gap the scroller shows once
      // the slide has ended with that distance never written.
      var lagOf = function () {
        var slide = followColumn.getAnimations()
        if (slide.length > 0) return Math.round(new DOMMatrix(getComputedStyle(followColumn).transform).m42 * 10) / 10
        return endGap()
      }
      var burstBlock = document.createElement('div')
      burstBlock.style.height = '2000px'
      followColumn.insertBefore(burstBlock, runningRow)
      followScroller.scrollTop = followScroller.scrollHeight
      r.chatFollow.burst = await recordWalk(lagOf, function () { return followColumn.getAnimations().length > 0 || endGap() > AT_END_PX })
      burstBlock.remove()
      await probe.settle()
      // The slide restarts from where the frame before it stood, not from the
      // linear share of its clock, and one growth is all the distance it may be
      // left carrying: a run at thirty milliseconds a growth measures the offset
      // the slide is drawn at on the frame after each landing, and the position
      // the scroller shows there. A slide left running past the next growth
      // reads a distance that grows with every step (D85).
      var paceFrames = []
      var paced = document.createElement('div')
      paced.style.height = '20px'
      followColumn.insertBefore(paced, runningRow)
      followScroller.scrollTop = followScroller.scrollHeight
      var nextFrame = probe.frame
      for (var step = 0; step < 8; step += 1) {
        await probe.sleep(30)
        paced.style.height = (24 + step * 20) + 'px'
        followScroller.scrollTop = followScroller.scrollHeight
        await nextFrame()
        paceFrames.push({
          gap: endGap(),
          offset: Math.round(new DOMMatrix(getComputedStyle(followColumn).transform).m42 * 10) / 10,
        })
      }
      await probe.sleep(600)
      r.chatFollow.pace = { frames: paceFrames, growth: 20, settled: endGap(), animations: followColumn.getAnimations().length }
      paced.remove()
      await probe.settle()
      // A structural shrink (a reasoning row leaving at the stream's end) takes
      // the running offset off with it. The host's own pin moves with the new
      // height; keeping the old offset would push the whole column down once.
      var shrinking = document.createElement('div')
      shrinking.style.height = '120px'
      followColumn.insertBefore(shrinking, runningRow)
      followScroller.scrollTop = followScroller.scrollHeight
      await probe.frame()
      var shrinkBefore = followColumn.getBoundingClientRect().top
      // The block leaves by the height a reasoning row does, not by enough to
      // end the scroll itself: with the column still overflowing, the host's
      // pin keeps the end standing and the reading position is comparable.
      shrinking.style.height = '100px'
      followScroller.scrollTop = followScroller.scrollHeight
      // The running offset is taken off on the resize callback, which lands
      // after the frame that painted the new height: read the column once the
      // slide is gone, or the figure still carries it.
      for (var shrinkFrames = 0; shrinkFrames < 12 && followColumn.getAnimations().length > 0; shrinkFrames++) await probe.frame()
      await probe.frame()
      r.chatFollow.shrink = {
        before: shrinkBefore,
        after: followColumn.getBoundingClientRect().top,
        animations: followColumn.getAnimations().length,
      }
      shrinking.remove()
      await probe.settle()
      // A reader reading higher up (D100). His own wheel is what stands the
      // host's follow down; once it is off, a growth lands below what he reads
      // and the position stays where he left it. The shape is the case's: the
      // wheel, the growth, the host writing nothing.
      followScroller.scrollTop = followScroller.scrollHeight
      await probe.settle()
      followScroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -400 }))
      followScroller.scrollTop = Math.max(0, followScroller.scrollHeight - followScroller.clientHeight - 400)
      await probe.settle()
      var readerTop = followScroller.scrollTop
      var readerGap = endGap()
      followColumn.parentElement.removeAttribute('data-chat-following-tail')
      var readerBlock = document.createElement('div')
      readerBlock.style.height = '120px'
      followColumn.insertBefore(readerBlock, runningRow)
      await probe.settle()
      r.chatFollow.readerGrowth = {
        before: readerTop,
        after: followScroller.scrollTop,
        grew: endGap() - readerGap,
        slides: followColumn.getAnimations().length,
      }
      readerBlock.remove()
      await probe.settle()
      // The host's own sample window after a submission (D100). The reader
      // wheels up, the sample closes the follow a beat later, and that close is
      // the reader's answer: the skin must not walk the position back and press
      // the button. The control closes the same mark with no reader move, where
      // the one hand-back is still expected.
      var frameCount = function (count) {
        return new Promise(function (resolve) {
          var left = count
          var step = function () {
            if (left <= 0) { resolve(); return }
            left -= 1
            requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        })
      }
      var sampleFollow = function (readerMoves) {
        followScroller.scrollTop = followScroller.scrollHeight
        return probe.settle().then(function () {
          // A fresh follow edge: the host has just said the tail is its own.
          followColumn.parentElement.setAttribute('data-chat-following-tail', '')
          return probe.settle()
        }).then(function () {
          var pressed = 0
          var onPress = function () {
            pressed += 1
            followColumn.parentElement.setAttribute('data-chat-following-tail', '')
            followScroller.scrollTop = followScroller.scrollHeight
          }
          followButton.addEventListener('click', onPress)
          if (readerMoves) {
            followScroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -300 }))
            followScroller.scrollTop = Math.max(0, followScroller.scrollHeight - followScroller.clientHeight - 300)
          }
          return probe.settle().then(function () {
            // The host's sample settles. With no reader move the loss is the
            // layout's, and the hand-back walks the position and presses; with
            // one, the wheel is the close, and the reader stays where he is.
            followColumn.parentElement.removeAttribute('data-chat-following-tail')
            var closed = !followColumn.parentElement.hasAttribute('data-chat-following-tail')
            return frameCount(60).then(function () {
              followButton.removeEventListener('click', onPress)
              return {
                closed: closed,
                before: pressed === 0 ? endGap() : 0,
                after: endGap(),
                presses: pressed,
              }
            })
          })
        })
      }
      r.chatFollow.sampleWithoutReader = await sampleFollow(false)
      r.chatFollow.sampleWithReader = await sampleFollow(true)
      streamingMark.remove()
      slideBlock.remove()
      runningRow.remove()
      followColumn.parentElement.removeAttribute('data-chat-following-tail')
      await probe.settle()
      followScroller.scrollTop = followScroller.scrollHeight
      await probe.settle()
    })
  })
})()
