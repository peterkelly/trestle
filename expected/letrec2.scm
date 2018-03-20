(letrec
    ((a *unspecified*) (b *unspecified*))
    ((lambda (v0)
            (begin
                (set! a v0)
                ((lambda (v1)
                        (begin
                            (set! b v1)
                            (+ a b SUCC)))
                    2)))
        1))
