(letrec
    ((a *unspecified*))
    ((lambda (v0)
            (begin
                (set! a v0)
                (+ a a SUCC)))
        1))
