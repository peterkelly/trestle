(letrec
    ((a *unspecified*) (b *unspecified*) (c *unspecified*))
    ((lambda (v0)
            (begin
                (set! a v0)
                ((lambda (v1)
                        (begin
                            (set! b v1)
                            ((lambda (v2)
                                    (begin
                                        (set! c v2)
                                        (+ a b c SUCC)))
                                3)))
                    2)))
        1))
